import dgram from "node:dgram";
import { activateResult, activateXml, checkActivationPassword, checkNetwork, decryptChallenge, makeChallengeKeys, sadpActivateXml, sadpModifyXml, sadpReplyResult, type NetworkChange, type PasswordCheck } from "./activation-core.ts";
import { inLocalSubnet, localIPv4, sadpGroupListener, SADP_GROUP, SADP_PORT } from "./sadp.server.ts";

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

/** Sends one SADP packet on every LAN interface and waits for the matching reply. */
export async function sadpSend(xml: string, mac: string, timeoutMs = 5000): Promise<PasswordCheck | null> {
  const message = Buffer.from(xml);
  let groupResult: PasswordCheck | null = null;
  const stop = sadpGroupListener((buffer) => { groupResult ||= sadpReplyResult(buffer.toString("utf8"), mac); });
  const results = await Promise.all(localIPv4().map(({ address }) => new Promise<PasswordCheck | null>((done) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let settled = false;
    const finish = (value: PasswordCheck | null) => { if (settled) return; settled = true; try { socket.close(); } catch { /* closed */ } done(value); };
    socket.on("error", () => finish(null));
    socket.on("message", (buffer) => { const r = sadpReplyResult(buffer.toString("utf8"), mac); if (r) finish(r); });
    socket.bind(0, address, () => {
      try { socket.setMulticastInterface(address); } catch { /* default */ }
      socket.send(message, SADP_PORT, SADP_GROUP, () => {});
      setTimeout(() => finish(null), timeoutMs);
    });
  })));
  stop();
  return results.find((r) => r?.ok) || groupResult || results.find(Boolean) || null;
}

/** Like SADP: when the device IP is outside this PC's subnet (e.g. factory 192.168.1.64 / 192.0.0.64)
 * HTTP cannot reach it, so the multicast SADP activate packet is tried first (needs only the MAC). */
export async function activateDevice(target: ActivateTarget, password: string, confirm: string, deps: { fetchImpl?: Fetch; sadp?: typeof sadpSend; reachable?: boolean } = {}): Promise<ActivateOutcome> {
  const check = checkActivationPassword(password, confirm);
  if (!check.ok) return { ...check, method: "" };
  const reachable = deps.reachable ?? inLocalSubnet(target.ip);
  if (!reachable && target.mac) {
    const r = await (deps.sadp || sadpSend)(sadpActivateXml(target.mac, password), target.mac);
    if (r) return { ...r, method: "sadp" };
  }
  let isapiError = "";
  try {
    const r = await isapiActivate(target, password, deps.fetchImpl);
    if (r.ok) return { ...r, method: "isapi" };
    if (r.error !== "unsupported") return { ...r, method: "isapi" };
  } catch { isapiError = "timeout"; }
  if (!target.mac) return { ok: false, error: isapiError ? "الجهاز مش بيرد. تأكد إنه شغال وعلى نفس الشبكة." : "الجهاز ده مش بيدعم التفعيل من البرنامج. فعّله من شاشة الجهاز.", method: "" };
  const r = await (deps.sadp || sadpSend)(sadpActivateXml(target.mac, password), target.mac);
  if (r) return { ...r, method: "sadp" };
  return { ok: false, error: "الجهاز ما ردش على طلب التفعيل. تأكد إن البرنامج والجهاز على نفس الشبكة (نفس الراوتر)، أو فعّله من شاشة الجهاز.", method: "" };
}

export async function modifyDeviceNetwork(mac: string, password: string, net: NetworkChange, sadp: typeof sadpSend = sadpSend): Promise<PasswordCheck> {
  if (!mac) return { ok: false, error: "عنوان MAC للجهاز غير معروف، ما ينفعش نغيّر الشبكة." };
  if (!password) return { ok: false, error: "اكتب كلمة مرور الجهاز." };
  const check = checkNetwork(net);
  if (!check.ok) return check;
  return (await sadp(sadpModifyXml(mac, password, net), mac)) || { ok: false, error: "الجهاز ما ردش على تغيير الشبكة. تأكد إنك على نفس الراوتر." };
}
