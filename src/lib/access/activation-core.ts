import { generateKeyPairSync, privateDecrypt, createCipheriv, constants, randomUUID, type KeyObject } from "node:crypto";

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
/** SADP multicast activate packet (older firmware accepts a plaintext password over the LAN). */
export function sadpActivateXml(mac: string, password: string, uuid = randomUUID().toUpperCase()) {
  return `<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>${uuid}</Uuid><MAC>${esc(mac.toLowerCase())}</MAC><Types>activate</Types><Password>${esc(password)}</Password></Probe>`;
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
/** SADP "update" (modify network parameters) packet; requires the device admin password. */
export function sadpModifyXml(mac: string, password: string, net: NetworkChange, uuid = randomUUID().toUpperCase()) {
  const port = net.httpPort && net.httpPort > 0 && net.httpPort < 65536 ? `<HttpPort>${net.httpPort}</HttpPort>` : "";
  return `<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>${uuid}</Uuid><MAC>${esc(mac.toLowerCase())}</MAC><Types>update</Types><Password>${esc(password)}</Password><DHCP>${net.dhcp ? "true" : "false"}</DHCP>${net.dhcp ? "" : `<IPv4Address>${net.ip}</IPv4Address><IPv4SubnetMask>${net.mask}</IPv4SubnetMask><IPv4Gateway>${net.gateway}</IPv4Gateway>`}${port}</Probe>`;
}
/** Parses a SADP reply to activate/update: <ProbeMatch>…<Result>success|failed</Result>. */
export function sadpReplyResult(xml: string, mac: string): PasswordCheck | null {
  if (!/<ProbeMatch[\s>]/.test(xml) || tag(xml, "MAC").toLowerCase() !== mac.toLowerCase()) return null;
  const result = tag(xml, "Result").toLowerCase();
  if (!result) return null;
  if (result === "success" || result === "true") return { ok: true, error: "" };
  return { ok: false, error: /deny|password/i.test(xml) ? "الجهاز رفض كلمة المرور." : "الجهاز رفض الطلب." };
}
