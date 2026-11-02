import dgram from "node:dgram";
import { activateResult, activateXml, checkActivationPassword, checkNetwork, decryptChallenge, decryptExchangeReply, encryptPasswordByRandom, makeChallengeKeys, makeSadpKeys, publicKeyCode, type SadpSecurity, sadpActivateXml, sadpExchangeXml, sadpModifyXml, sadpReplyResult, type NetworkChange, type PasswordCheck } from "./activation-core.ts";
import { inLocalSubnet, localIPv4, sadpDiscover, sadpGroupListener, SADP_GROUP, SADP_PORT } from "./sadp.server.ts";

type Fetch = (url: string, init: RequestInit) => Promise<{ status: number; text(): Promise<string> }>;
export type ActivateTarget = { ip: string; httpPort: number; mac: string };
export type ActivateOutcome = PasswordCheck & { method: "isapi" | "sadp" | "" };

/** Activates over ISAPI (challenge + encrypted password). Returns error "unsupported" when the endpoints are missing. */
export async function isapiActivate(target: ActivateTarget, password: string, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<PasswordCheck> {
  const base = `http://${target.ip}:${target.httpPort || 80}`;
  const headers = { "Content-Type": "application/xml" };
  const keys = makeChallengeKeys();
  const challenge = await fetchImpl(`${base}/ISAPI/Security/challenge`, { method: "POST", headers, body: keys.publicKeyXml, signal: AbortSignal.timeout(8000) });
  const challengeBody = await challenge.text();
  if (challenge.status === 404 || challenge.status === 405) return { ok: false, error: "unsupported" };
  if (challenge.status === 401) return { ok: false, error: "الجهاز متفعّل بالفعل. ادخل بكلمة المرور الحالية بتاعته." };
  if (challenge.status !== 200) return { ok: false, error: "unsupported" };
  let randomKey: string;
  try { randomKey = decryptChallenge(challengeBody, keys.privateKey); } catch { return { ok: false, error: "unsupported" }; }
  const response = await fetchImpl(`${base}/ISAPI/System/activate`, { method: "PUT", headers, body: activateXml(randomKey, password), signal: AbortSignal.timeout(10000) });
  return activateResult(response.status, await response.text());
}

const replyMac = (xml: string) => ((xml.match(/<MAC>([^<]*)<\/MAC>/) || [])[1] || "").trim().toLowerCase();
const replyTypes = (xml: string) => ((xml.match(/<Types>([^<]*)<\/Types>/) || [])[1] || "").trim().toLowerCase();
/** Sends one SADP packet on every NIC (UDP; then raw L2 via WinPcap/Npcap if nothing came back) and returns the
 * first ProbeMatch from that MAC answering the same <Types>. */
export async function sadpRequest(xml: string, mac: string, types: string, timeoutMs = 5000): Promise<string | null> {
  const message = Buffer.from(xml);
  const want = (text: string) => /<ProbeMatch[\s>]/.test(text) && replyMac(text) === mac.toLowerCase() && (!replyTypes(text) || replyTypes(text) === types.toLowerCase());
  let groupReply: string | null = null;
  const stop = sadpGroupListener((buffer) => { const t = buffer.toString("utf8"); if (!groupReply && want(t)) groupReply = t; });
  // Real-device test (DS-K1T673DGX-E1): the first exchangecode got no reply while the second answered in 120 ms, so wait for the
  // group socket to be joined before sending, and resend the identical packet once if nothing came back after 1.5 s.
  await stop.ready;
  const results = await Promise.all(localIPv4().map(({ address }) => new Promise<string | null>((done) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let settled = false;
    const finish = (value: string | null) => { if (settled) return; settled = true; clearInterval(poll); try { socket.close(); } catch { /* closed */ } done(value); };
    const poll = setInterval(() => { if (groupReply) finish(groupReply); }, 100);
    socket.on("error", () => finish(null));
    socket.on("message", (buffer) => { const t = buffer.toString("utf8"); if (want(t)) finish(t); });
    socket.bind(0, address, () => {
      try { socket.setMulticastInterface(address); } catch { /* default */ }
      socket.send(message, SADP_PORT, SADP_GROUP, () => {});
      setTimeout(() => { if (!settled) try { socket.send(message, SADP_PORT, SADP_GROUP, () => {}); } catch { /* closed */ } }, 1500);
      setTimeout(() => finish(null), timeoutMs);
    });
  })));
  stop();
  const hit = results.find(Boolean) || groupReply;
  if (hit) return hit;
  const { pcapExchange } = await import("./pcap.server.ts");
  return (await pcapExchange(message, 3000)).find(want) || null;
}
export type SadpRequest = typeof sadpRequest;

/** SADP activation exactly like SADPTool: exchangecode (our RSA key) → decrypt device random → activate with encrypted password. */
export async function sadpActivate(mac: string, password: string, request: SadpRequest = sadpRequest): Promise<PasswordCheck | null> {
  const keys = makeSadpKeys();
  const reply = await request(sadpExchangeXml(mac, publicKeyCode(keys)), mac, "exchangecode");
  if (!reply) return null;
  let random: string;
  try { random = decryptExchangeReply(reply, keys.privateKey); } catch { return { ok: false, error: "الجهاز رد بصيغة تشفير مش مدعومة. فعّله من برنامج SADP أو شاشة الجهاز وقولنا الموديل." }; }
  const result = await request(sadpActivateXml(mac, encryptPasswordByRandom(random, password)), mac, "activate");
  return result ? sadpReplyResult(result, mac) || { ok: false, error: "رد الجهاز على التفعيل مش مفهوم." } : null;
}

/** Like SADP: when the device IP is outside this PC's subnet (e.g. factory 192.168.1.64 / 192.0.0.64)
 * HTTP cannot reach it, so the multicast SADP activate packet is tried first (needs only the MAC). */
export async function activateDevice(target: ActivateTarget, password: string, confirm: string, deps: { fetchImpl?: Fetch; sadp?: SadpRequest; reachable?: boolean } = {}): Promise<ActivateOutcome> {
  const check = checkActivationPassword(password, confirm);
  if (!check.ok) return { ...check, method: "" };
  const reachable = deps.reachable ?? inLocalSubnet(target.ip);
  if (!reachable && target.mac) {
    const r = await sadpActivate(target.mac, password, deps.sadp);
    if (r) return { ...r, method: "sadp" };
  }
  let isapiError = "";
  try {
    const r = await isapiActivate(target, password, deps.fetchImpl);
    if (r.ok) return { ...r, method: "isapi" };
    if (r.error !== "unsupported") return { ...r, method: "isapi" };
  } catch { isapiError = "timeout"; }
  if (!target.mac) return { ok: false, error: isapiError ? "الجهاز مش بيرد. تأكد إنه شغال وعلى نفس الشبكة." : "الجهاز ده مش بيدعم التفعيل من البرنامج. فعّله من شاشة الجهاز.", method: "" };
  const r = await sadpActivate(target.mac, password, deps.sadp);
  if (r) return { ...r, method: "sadp" };
  return { ok: false, error: "الجهاز ما ردش على طلب التفعيل. تأكد إن البرنامج والجهاز على نفس الشبكة (نفس الراوتر)، أو فعّله من شاشة الجهاز.", method: "" };
}

/** Reads <Salt>/<Encrypt> for one MAC from a fresh inquiry (Sadp.dll keeps them from discovery). */
export async function sadpSecurityFor(mac: string): Promise<SadpSecurity | undefined> {
  const row = (await sadpDiscover()).find((d) => d.mac === mac.toLowerCase());
  return row ? { salt: row.salt, encrypt: row.encrypt } : undefined;
}
export async function modifyDeviceNetwork(mac: string, password: string, net: NetworkChange, request: SadpRequest = sadpRequest, security: (mac: string) => Promise<SadpSecurity | undefined> = sadpSecurityFor): Promise<PasswordCheck> {
  if (!mac) return { ok: false, error: "عنوان MAC للجهاز غير معروف، ما ينفعش نغيّر الشبكة." };
  if (!password) return { ok: false, error: "اكتب كلمة مرور الجهاز." };
  const check = checkNetwork(net);
  if (!check.ok) return check;
  const sec = await security(mac).catch(() => undefined);
  // Sadp.dll ModifyNetParamV40 (@0x1002cf80) runs an exchangecode round first on these devices.
  if (sec?.encrypt) await request(sadpExchangeXml(mac, makeSadpKeys().code), mac, "exchangecode");
  const reply = await request(sadpModifyXml(mac, password, net, undefined, sec), mac, "update");
  return (reply && sadpReplyResult(reply, mac)) || { ok: false, error: "الجهاز ما ردش على تغيير الشبكة. تأكد إنك على نفس الراوتر." };
}

/** Sets Wi-Fi via ISAPI (digest auth with the admin password) then switches the wireless interface to DHCP. */
export async function configureWifi(target: { ip: string; httpPort: number }, password: string, wifi: import("./activation-core.ts").WifiConfig, session?: { request(url: string, method: string, body?: string, ct?: string): Promise<{ status: number; text: string }> }): Promise<PasswordCheck> {
  const { checkWifi, wirelessXml, wirelessInterfaceId } = await import("./activation-core.ts");
  const check = checkWifi(wifi);
  if (!check.ok) return check;
  if (!password) return { ok: false, error: "اكتب كلمة مرور الأدمن للجهاز." };
  const s = session || new (await import("../hikvision.server.ts")).DigestSession("admin", password);
  const base = `http://${target.ip}:${target.httpPort || 80}/ISAPI/System/Network/interfaces`;
  const list = await s.request(base, "GET");
  if (list.status === 401) return { ok: false, error: "كلمة مرور الأدمن غلط." };
  const id = list.status === 200 ? wirelessInterfaceId(list.text) : "2";
  if (!id) return { ok: false, error: "الجهاز ده مالوش واي فاي." };
  const put = await s.request(`${base}/${id}/wireless`, "PUT", wirelessXml(wifi), "application/xml");
  if (put.status === 404 || put.status === 405) return { ok: false, error: "الجهاز ده مش بيدعم ضبط الواي فاي من البرنامج. اضبطه من شاشة الجهاز." };
  if (put.status !== 200) return { ok: false, error: "الجهاز رفض إعدادات الواي فاي. راجع اسم الشبكة والباسورد." };
  const ipBody = `<?xml version="1.0" encoding="UTF-8"?><IPAddress version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><ipVersion>v4</ipVersion><addressingType>dynamic</addressingType></IPAddress>`;
  await s.request(`${base}/${id}/ipAddress`, "PUT", ipBody, "application/xml").catch(() => null);
  return { ok: true, error: "" };
}
