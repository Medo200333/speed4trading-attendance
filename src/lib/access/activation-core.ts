import { generateKeyPairSync, privateDecrypt, createCipheriv, createHash, constants, randomUUID, type KeyObject } from "node:crypto";

/** Hikvision device activation helpers (pure, unit-tested; no network here).
 * ISAPI flow used by SADP/iVMS over HTTP (unauthenticated, only works on an inactive device):
 *  1. POST /ISAPI/Security/challenge  <PublicKey><key>base64(hex RSA-1024 modulus)</key></PublicKey>
 *  2. device answers <Challenge><key>hex(RSA-PKCS1 encrypted random key)</key></Challenge>
 *  3. PUT /ISAPI/System/activate <ActivateInfo><password>base64(hex(AES-128-ECB(key16 + password)))</password></ActivateInfo>
 * Firmware variants differ; callers must treat every step as best-effort and report clearly. */

export type PasswordCheck = { ok: boolean; error: string };
/** Hikvision rules: 8–16 chars, at least two of: lowercase, uppercase, digits, symbols; must not contain the username. */
export function checkActivationPassword(password: string, confirm: string, username = "admin"): PasswordCheck {
  if (!password) return { ok: false, error: "اكتب كلمة المرور الجديدة." };
  if (password.length < 8 || password.length > 16) return { ok: false, error: "كلمة المرور لازم تكون من 8 إلى 16 حرف." };
  if (/[^\x21-\x7e]/.test(password)) return { ok: false, error: "استخدم حروف إنجليزي وأرقام ورموز فقط (بدون مسافات أو حروف عربي)." };
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(password)).length;
  if (kinds < 2) return { ok: false, error: "كلمة المرور لازم تحتوي على نوعين على الأقل: حروف صغيرة، حروف كبيرة، أرقام، رموز." };
  if (username && password.toLowerCase().includes(username.toLowerCase())) return { ok: false, error: "كلمة المرور ما ينفعش تحتوي على اسم المستخدم." };
  if (password !== confirm) return { ok: false, error: "تأكيد كلمة المرور مش مطابق." };
  return { ok: true, error: "" };
}

export type ChallengeKeys = { publicKeyXml: string; privateKey: KeyObject };
export function makeChallengeKeys(): ChallengeKeys {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const jwk = publicKey.export({ format: "jwk" }) as { n: string };
  const modulusHex = Buffer.from(jwk.n, "base64url").toString("hex");
  const key = Buffer.from(modulusHex).toString("base64");
  return { privateKey, publicKeyXml: `<?xml version="1.0" encoding="UTF-8"?><PublicKey><key>${key}</key></PublicKey>` };
}
const tag = (xml: string, name: string) => (xml.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1]?.trim() || "";

/** Decrypts the device challenge, returning the random key string (usually 32 hex chars). */
export function decryptChallenge(xml: string, privateKey: KeyObject): string {
  const hex = tag(xml, "key");
  if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error("challenge-format");
  const plain = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(hex, "hex"));
  return plain.toString("latin1");
}
/** Builds the encrypted activation password body from the decrypted random key. */
export function activateXml(randomKey: string, password: string) {
  const aesKey = /^[0-9a-fA-F]{32,}$/.test(randomKey) ? Buffer.from(randomKey.slice(0, 32), "hex") : Buffer.from(randomKey.padEnd(16, "\0").slice(0, 16), "latin1");
  const content = Buffer.from(randomKey.slice(0, 16) + password, "latin1");
  const padded = Buffer.alloc(Math.ceil(content.length / 16) * 16);
  content.copy(padded);
  const cipher = createCipheriv("aes-128-ecb", aesKey, null);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]).toString("hex");
  return `<?xml version="1.0" encoding="UTF-8"?><ActivateInfo><password>${Buffer.from(encrypted).toString("base64")}</password></ActivateInfo>`;
}
/** Interprets the PUT /ISAPI/System/activate response. */
export function activateResult(status: number, body: string): PasswordCheck {
  const code = tag(body, "statusCode"), sub = tag(body, "subStatusCode");
  if (status === 200 && (!code || code === "1")) return { ok: true, error: "" };
  if (/activated|alreadyActivated/i.test(sub) || (status === 401 || status === 403)) return { ok: false, error: "الجهاز متفعّل بالفعل. ادخل بكلمة المرور الحالية بتاعته." };
  if (/password|riskPassword|weak/i.test(sub)) return { ok: false, error: "الجهاز رفض كلمة المرور لأنها ضعيفة. جرّب كلمة أقوى فيها حروف كبيرة وصغيرة وأرقام." };
  if (status === 404 || status === 405) return { ok: false, error: "unsupported" };
  return { ok: false, error: `الجهاز رفض التفعيل${sub ? ` (${sub})` : ""}.` };
}

const esc = (v: string) => v.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
/* SADP packet formats below were read from SADPTool's Sadp.dll (x86, CMulticastProtocol), see docs in sadp-protocol.md:
 *  exchangecode (PackageExchangeCode @0x10040d60): RSA-1024 key pair (CSSLTrans::SSLTrans_GeneralRSAKey: RSA_generate_key_ex(1024, 65537)
 *    then i2d_RSAPublicKey) → <Code> = base64(PKCS#1 DER RSAPublicKey).  (The ISAPI "hex modulus" form is rejected: device answers <Result>failed</Result>.)
 *  reply (DecryptExchangeCode @0x1003f900): <Code> = base64(RSA-PKCS#1-v1.5(random)) → random string.
 *  activate (EncryptPWByRandomStr @0x100404f0): AES-128-ECB(key = random[0..16] raw bytes, data = random[0..16] + password, zero padded
 *    to 32 bytes, password ≤ 16) → base64(raw ciphertext) (NOT hex like ISAPI). */
export function sadpExchangeXml(mac: string, publicKeyB64: string, uuid = randomUUID().toUpperCase()) {
  return `<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>${uuid}</Uuid><MAC>${esc(mac.toLowerCase())}</MAC><Types>exchangecode</Types><Code>${publicKeyB64}</Code></Probe>`;
}
export type SadpKeys = { code: string; privateKey: KeyObject };
/** RSA key for SADP exchangecode, exactly like Sadp.dll: 1024-bit, e=65537, <Code> = base64(PKCS#1 DER public key). */
export function makeSadpKeys(bits = 1024): SadpKeys {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: bits, publicExponent: 65537 });
  return { privateKey, code: publicKey.export({ type: "pkcs1", format: "der" }).toString("base64") };
}
/** Legacy name kept for callers: the SADP <Code> for a key pair. */
export function publicKeyCode(keys: SadpKeys) { return keys.code; }
/** Reads the device's <Code> (base64 per Sadp.dll; hex accepted as fallback) and RSA-PKCS1 decrypts the random string. */
export function decryptExchangeReply(xml: string, privateKey: KeyObject): string {
  const code = tag(xml, "Code");
  if (!code) throw new Error("no-code");
  const size = (privateKey.asymmetricKeyDetails?.modulusLength || 1024) / 8;
  const b64 = Buffer.from(code, "base64");
  const bytes = b64.length === size || !/^[0-9a-fA-F]+$/.test(code) ? b64 : Buffer.from(code, "hex");
  return privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, bytes).toString("latin1");
}
const zeroPad = (data: Buffer, size: number) => { const out = Buffer.alloc(size); data.copy(out, 0, 0, size); return out; };
const aesEcb = (key: Buffer, data: Buffer) => { const c = createCipheriv("aes-128-ecb", key, null); c.setAutoPadding(false); return Buffer.concat([c.update(data), c.final()]); };
/** Sadp.dll EncryptPWByRandomStr: base64(AES-128-ECB(random[0..16], pad32(random[0..16] + password))). */
export function encryptPasswordByRandom(randomKey: string, password: string) {
  if (password.length > 16) throw new Error("password-too-long");
  const r = zeroPad(Buffer.from(randomKey, "latin1"), 16);
  return aesEcb(r, zeroPad(Buffer.concat([r, Buffer.from(password, "latin1")]), 32)).toString("base64");
}
export function sadpActivateXml(mac: string, encryptedPassword: string, uuid = randomUUID().toUpperCase()) {
  return `<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>${uuid}</Uuid><MAC>${esc(mac.toLowerCase())}</MAC><Types>activate</Types><Password>${esc(encryptedPassword)}</Password></Probe>`;
}
/** Device security info from the inquiry reply (<Salt>, <Encrypt>), needed for the "update" password. */
export type SadpSecurity = { salt?: string; encrypt?: boolean; username?: string };
/** Sadp.dll PackageUpdateData @0x10043400 (+ helper @0x1003f2f0):
 *  digest = salt ? MD5(lowercase-hex SHA256(username + salt + password)) : MD5(password)
 *  Encrypt=true → base64(AES-128-ECB(key = digest, pad64(digest + ";" + password)))   else → base64(digest). */
export function sadpUpdatePassword(password: string, sec: SadpSecurity) {
  const user = sec.username || "admin";
  const digest = sec.salt
    ? createHash("md5").update(createHash("sha256").update(user + sec.salt + password).digest("hex")).digest()
    : createHash("md5").update(password).digest();
  if (!sec.encrypt) return digest.toString("base64");
  return aesEcb(digest, zeroPad(Buffer.concat([digest, Buffer.from(";" + password, "latin1")]), 64)).toString("base64");
}
export type NetworkChange = { dhcp: boolean; ip: string; mask: string; gateway: string; httpPort?: number };
export function checkNetwork(net: NetworkChange): PasswordCheck {
  if (net.dhcp) return { ok: true, error: "" };
  const ipv4 = (v: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split(".").every((p) => Number(p) <= 255);
  if (!ipv4(net.ip)) return { ok: false, error: "عنوان IP مش صحيح." };
  if (!ipv4(net.mask)) return { ok: false, error: "قناع الشبكة (Subnet) مش صحيح." };
  if (net.gateway && !ipv4(net.gateway)) return { ok: false, error: "عنوان البوابة (Gateway) مش صحيح." };
  return { ok: true, error: "" };
}
/** SADP "update" (modify network parameters), field order exactly as Sadp.dll's format string. Needs the admin password.
 * With DHCP the current/any IP fields are still sent (the device ignores them). */
export function sadpModifyXml(mac: string, password: string, net: NetworkChange & { commandPort?: number }, uuid = randomUUID().toUpperCase(), sec?: SadpSecurity) {
  const port = net.httpPort && net.httpPort > 0 && net.httpPort < 65536 ? `<HttpPort>${net.httpPort}</HttpPort>` : "";
  // Devices that report <Salt>/<Encrypt> get the Sadp.dll PackageUpdateData password (bSalt="true" when a salt exists); others the legacy plain form.
  const secure = Boolean(sec && (sec.salt || sec.encrypt));
  const pw = secure ? sadpUpdatePassword(password, sec!) : password;
  return `<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>${uuid}</Uuid><Types>update</Types><PWErrorParse>true</PWErrorParse><MAC>${esc(mac.toLowerCase())}</MAC><Password${secure && sec!.salt ? ' bSalt="true"' : ""}>${esc(pw)}</Password><IPv4Address>${net.ip || "0.0.0.0"}</IPv4Address><CommandPort>${net.commandPort || 8000}</CommandPort><IPv4SubnetMask>${net.mask || "255.255.255.0"}</IPv4SubnetMask><IPv4Gateway>${net.gateway || "0.0.0.0"}</IPv4Gateway><IPv6Address>::</IPv6Address><IPv6Gateway>::</IPv6Gateway><IPv6MaskLen>64</IPv6MaskLen><DHCP>${net.dhcp ? "true" : "false"}</DHCP>${port}</Probe>`;
}
/** Parses a SADP reply to activate/update: <ProbeMatch>…<Result>success|failed</Result>. */
export function sadpReplyResult(xml: string, mac: string, types?: string): PasswordCheck | null {
  if (!/<ProbeMatch[\s>]/.test(xml) || tag(xml, "MAC").toLowerCase() !== mac.toLowerCase()) return null;
  if (types && tag(xml, "Types") && tag(xml, "Types").toLowerCase() !== types.toLowerCase()) return null;
  const result = tag(xml, "Result").toLowerCase();
  if (!result) return null;
  if (result === "success" || result === "true") return { ok: true, error: "" };
  if (/PasswordError/i.test(xml) || result === "passworderror") return { ok: false, error: "كلمة مرور الأدمن غلط." };
  return { ok: false, error: /deny|password/i.test(xml) ? "الجهاز رفض كلمة المرور." : "الجهاز رفض الطلب." };
}

export type WifiConfig = { ssid: string; password: string; security: "WPA2-personal" | "WPA-personal" | "WPA3-personal" | "disable" };
export function checkWifi(w: WifiConfig): PasswordCheck {
  if (!w.ssid.trim() || Buffer.byteLength(w.ssid) > 32) return { ok: false, error: "اكتب اسم شبكة الواي فاي (SSID) بالظبط زي ما هو، لحد 32 حرف." };
  if (w.security !== "disable" && (w.password.length < 8 || w.password.length > 63)) return { ok: false, error: "باسورد الواي فاي لازم يكون من 8 لـ 63 حرف." };
  return { ok: true, error: "" };
}
/** ISAPI Wireless body (PUT /ISAPI/System/Network/interfaces/<id>/wireless). Network mode DHCP is set separately via ipAddress. */
export function wirelessXml(w: WifiConfig) {
  const sec = w.security === "disable" ? "<WirelessSecurity><securityMode>disable</securityMode></WirelessSecurity>"
    : `<WirelessSecurity><securityMode>${w.security}</securityMode><WPA><algorithmType>AES</algorithmType><sharedKey>${esc(w.password)}</sharedKey><wpaKeyLength>${Buffer.byteLength(w.password)}</wpaKeyLength></WPA></WirelessSecurity>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Wireless version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><enabled>true</enabled><wirelessNetworkMode>infrastructure</wirelessNetworkMode><ssid>${esc(w.ssid)}</ssid>${sec}</Wireless>`;
}
/** Picks the wireless interface id from GET /ISAPI/System/Network/interfaces (falls back to 2, the usual Wi-Fi id). */
export function wirelessInterfaceId(xml: string) {
  const blocks = xml.split(/<NetworkInterface[\s>]/).slice(1);
  for (const b of blocks) if (/<Wireless[\s>]/.test(b) || /wlan|wireless/i.test(b)) return (b.match(/<id>(\d+)<\/id>/) || [])[1] || "2";
  return blocks.length > 1 ? "2" : "";
}

/** Raw Ethernet SADP (what SADP does via Npcap): multicast frame to 01:00:5e:7f:ff:fa carrying the UDP inquiry. */
export function sadpEthernetFrame(srcMac: string, payload: Buffer, srcIp = "0.0.0.0") {
  const mac = (m: string) => Buffer.from(m.split(/[:-]/).map((h) => parseInt(h, 16)));
  const ip = (v: string) => Buffer.from(v.split(".").map(Number));
  const udpLen = 8 + payload.length, ipLen = 20 + udpLen;
  const ipH = Buffer.alloc(20);
  ipH.writeUInt8(0x45, 0); ipH.writeUInt16BE(ipLen, 2); ipH.writeUInt8(1, 8); ipH.writeUInt8(17, 9);
  ip(srcIp).copy(ipH, 12); ip("239.255.255.250").copy(ipH, 16);
  let sum = 0; for (let i = 0; i < 20; i += 2) sum += ipH.readUInt16BE(i);
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  ipH.writeUInt16BE(~sum & 0xffff, 10);
  const udp = Buffer.alloc(8);
  udp.writeUInt16BE(37020, 0); udp.writeUInt16BE(37020, 2); udp.writeUInt16BE(udpLen, 4);
  return Buffer.concat([mac("01:00:5e:7f:ff:fa"), mac(srcMac), Buffer.from([0x08, 0x00]), ipH, udp, payload]);
}
/** Extracts the UDP payload of a captured IPv4/UDP frame from/to port 37020, else null. */
export function sadpPayloadFromFrame(frame: Buffer): Buffer | null {
  if (frame.length < 42 || frame.readUInt16BE(12) !== 0x0800) return null;
  const ihl = (frame[14] & 15) * 4;
  if (frame[23] !== 17) return null;
  const u = 14 + ihl;
  if (frame.readUInt16BE(u) !== 37020 && frame.readUInt16BE(u + 2) !== 37020) return null;
  return frame.subarray(u + 8, Math.min(frame.length, u + frame.readUInt16BE(u + 4)));
}
