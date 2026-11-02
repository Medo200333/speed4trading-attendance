import test from "node:test";
import assert from "node:assert/strict";
import { publicEncrypt, createDecipheriv, constants, createPublicKey } from "node:crypto";
import { checkActivationPassword, makeChallengeKeys, decryptChallenge, activateXml, activateResult, sadpActivateXml, sadpModifyXml, sadpReplyResult, checkNetwork } from "./activation-core.ts";
import { activateDevice, modifyDeviceNetwork } from "./activation.server.ts";

test("password rules", () => {
  assert.equal(checkActivationPassword("Ab1", "Ab1").ok, false);
  assert.equal(checkActivationPassword("abcdefgh", "abcdefgh").ok, false);
  assert.equal(checkActivationPassword("abcdefg1", "abcdefg2").error, "تأكيد كلمة المرور مش مطابق.");
  assert.equal(checkActivationPassword("myadmin12", "myadmin12").ok, false);
  assert.equal(checkActivationPassword("a".repeat(15) + "12", "x").ok, false);
  assert.equal(checkActivationPassword("كلمة سر12", "كلمة سر12").ok, false);
  assert.equal(checkActivationPassword("Speed2026", "Speed2026").ok, true);
});

/** Simulated device: reads our modulus, encrypts a random key with it. */
function fakeChallenge(publicKeyXml: string, randomKey: string) {
  const b64 = publicKeyXml.match(/<key>([^<]+)<\/key>/)![1];
  const n = Buffer.from(Buffer.from(b64, "base64").toString(), "hex").toString("base64url");
  const key = createPublicKey({ key: { kty: "RSA", n, e: "AQAB" }, format: "jwk" });
  const enc = publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(randomKey)).toString("hex");
  return `<Challenge><key>${enc}</key></Challenge>`;
}
const RANDOM = "0123456789abcdef0123456789abcdef";

test("challenge round trip and encrypted password", () => {
  const keys = makeChallengeKeys();
  assert.equal(decryptChallenge(fakeChallenge(keys.publicKeyXml, RANDOM), keys.privateKey), RANDOM);
  const xml = activateXml(RANDOM, "Speed2026");
  const hex = Buffer.from(xml.match(/<password>([^<]+)</)![1], "base64").toString();
  const d = createDecipheriv("aes-128-ecb", Buffer.from(RANDOM, "hex"), null);
  d.setAutoPadding(false);
  const plain = Buffer.concat([d.update(Buffer.from(hex, "hex")), d.final()]).toString("latin1").replace(/\0+$/, "");
  assert.equal(plain, RANDOM.slice(0, 16) + "Speed2026");
});

test("activate result mapping", () => {
  assert.equal(activateResult(200, "<ResponseStatus><statusCode>1</statusCode></ResponseStatus>").ok, true);
  assert.equal(activateResult(404, "").error, "unsupported");
  assert.match(activateResult(400, "<subStatusCode>riskPassword</subStatusCode>").error, /ضعيفة/);
  assert.match(activateResult(403, "").error, /متفعّل/);
});

test("sadp packets and replies", () => {
  assert.equal(sadpActivateXml("AA-BB-CC-00-11-22", "ZW5j", "U"), '<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>U</Uuid><MAC>aa-bb-cc-00-11-22</MAC><Types>activate</Types><Password>ZW5j</Password></Probe>');
  const m = sadpModifyXml("aa-bb", "Speed2026", { dhcp: false, ip: "192.168.1.50", mask: "255.255.255.0", gateway: "192.168.1.1" }, "U");
  assert.equal(m, '<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>U</Uuid><Types>update</Types><PWErrorParse>true</PWErrorParse><MAC>aa-bb</MAC><Password>Speed2026</Password><IPv4Address>192.168.1.50</IPv4Address><CommandPort>8000</CommandPort><IPv4SubnetMask>255.255.255.0</IPv4SubnetMask><IPv4Gateway>192.168.1.1</IPv4Gateway><IPv6Address>::</IPv6Address><IPv6Gateway>::</IPv6Gateway><IPv6MaskLen>64</IPv6MaskLen><DHCP>false</DHCP></Probe>');
  assert.match(sadpModifyXml("aa", "p", { dhcp: true, ip: "", mask: "", gateway: "" }), /<DHCP>true<\/DHCP>/);
  assert.match(sadpReplyResult("<ProbeMatch><MAC>aa</MAC><Result>failed</Result><Description>PasswordError</Description></ProbeMatch>", "aa")!.error, /غلط/);
  assert.deepEqual(sadpReplyResult("<ProbeMatch><MAC>AA-BB</MAC><Result>success</Result></ProbeMatch>", "aa-bb"), { ok: true, error: "" });
  assert.equal(sadpReplyResult("<ProbeMatch><MAC>cc</MAC><Result>success</Result></ProbeMatch>", "aa-bb"), null);
  assert.equal(sadpReplyResult("<ProbeMatch><MAC>aa-bb</MAC><Result>failed</Result></ProbeMatch>", "aa-bb")?.ok, false);
  assert.equal(checkNetwork({ dhcp: false, ip: "192.168.1.300", mask: "255.255.255.0", gateway: "" }).ok, false);
});

test("activateDevice via mocked ISAPI", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push(`${init.method} ${url}`);
    if (url.endsWith("/challenge")) return { status: 200, text: async () => fakeChallenge(String(init.body), RANDOM) };
    assert.match(String(init.body), /<ActivateInfo><password>/);
    return { status: 200, text: async () => "<ResponseStatus><statusCode>1</statusCode></ResponseStatus>" };
  };
  const r = await activateDevice({ ip: "192.168.1.24", httpPort: 80, mac: "aa" }, "Speed2026", "Speed2026", { fetchImpl, reachable: true, sadp: async () => assert.fail("no sadp") });
  assert.deepEqual(r, { ok: true, error: "", method: "isapi" });
  assert.deepEqual(calls, ["POST http://192.168.1.24:80/ISAPI/Security/challenge", "PUT http://192.168.1.24:80/ISAPI/System/activate"]);
});

/** Simulated SADP device: answers exchangecode with base64 RSA(random), checks the encrypted activate password. */
function fakeSadpDevice(expectPassword: string) {
  const sent: string[] = [];
  return { sent, request: async (xml: string, mac: string, types: string) => {
    sent.push(types);
    if (types === "exchangecode") {
      const keyB64 = xml.match(/<Code>([^<]+)<\/Code>/)![1];
      const n = Buffer.from(Buffer.from(keyB64, "base64").toString(), "hex").toString("base64url");
      const key = createPublicKey({ key: { kty: "RSA", n, e: "AQAB" }, format: "jwk" });
      return `<ProbeMatch><MAC>${mac}</MAC><Types>exchangecode</Types><Code>${publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(RANDOM)).toString("base64")}</Code></ProbeMatch>`;
    }
    const pw = xml.match(/<Password>([^<]+)<\/Password>/)![1];
    const d = createDecipheriv("aes-128-ecb", Buffer.from(RANDOM, "hex"), null); d.setAutoPadding(false);
    const plain = Buffer.concat([d.update(Buffer.from(Buffer.from(pw, "base64").toString(), "hex")), d.final()]).toString("latin1").replace(/\0+$/, "");
    return `<ProbeMatch><MAC>${mac}</MAC><Types>${types}</Types><Result>${plain === RANDOM.slice(0, 16) + expectPassword ? "success" : "failed"}</Result></ProbeMatch>`;
  } };
}
test("activateDevice falls back to SADP exchangecode+activate when ISAPI is unsupported", async () => {
  const fetchImpl = async () => ({ status: 404, text: async () => "" });
  const dev = fakeSadpDevice("Speed2026");
  const r = await activateDevice({ ip: "192.168.1.24", httpPort: 80, mac: "aa-bb" }, "Speed2026", "Speed2026", { fetchImpl, reachable: true, sadp: dev.request });
  assert.deepEqual(r, { ok: true, error: "", method: "sadp" });
  assert.deepEqual(dev.sent, ["exchangecode", "activate"]);
  const weak = await activateDevice({ ip: "1", httpPort: 80, mac: "" }, "weak", "weak", { fetchImpl });
  assert.equal(weak.ok, false);
  const none = await activateDevice({ ip: "1", httpPort: 80, mac: "aa" }, "Speed2026", "Speed2026", { fetchImpl, reachable: true, sadp: async () => null });
  assert.match(none.error, /ما ردش/);
});
test("modify network needs password and valid IP", async () => {
  assert.equal((await modifyDeviceNetwork("aa", "", { dhcp: true, ip: "", mask: "", gateway: "" })).ok, false);
  assert.equal((await modifyDeviceNetwork("aa", "Speed2026", { dhcp: false, ip: "x", mask: "", gateway: "" }, async () => assert.fail("no send"))).ok, false);
  assert.equal((await modifyDeviceNetwork("aa", "Speed2026", { dhcp: true, ip: "", mask: "", gateway: "" }, async (_x, mac) => `<ProbeMatch><MAC>${mac}</MAC><Types>update</Types><Result>success</Result></ProbeMatch>`)).ok, true);
});

test("outside-subnet device is activated via SADP without HTTP", async () => {
  const r = await activateDevice({ ip: "192.0.0.64", httpPort: 80, mac: "aa" }, "Speed2026", "Speed2026", { reachable: false, fetchImpl: async () => assert.fail("no http"), sadp: fakeSadpDevice("Speed2026").request });
  assert.equal(r.method, "sadp");
});

import { checkWifi, wirelessXml, wirelessInterfaceId, sadpEthernetFrame, sadpPayloadFromFrame } from "./activation-core.ts";
import { configureWifi } from "./activation.server.ts";
test("wifi xml + interface id", () => {
  assert.equal(checkWifi({ ssid: "", password: "12345678", security: "WPA2-personal" }).ok, false);
  assert.equal(checkWifi({ ssid: "Omar", password: "123", security: "WPA2-personal" }).ok, false);
  assert.match(wirelessXml({ ssid: "Omar & Co", password: "pass1234", security: "WPA2-personal" }), /<ssid>Omar &#38; Co<\/ssid>.*<sharedKey>pass1234<\/sharedKey>/);
  assert.equal(wirelessInterfaceId("<NetworkInterfaceList><NetworkInterface><id>1</id></NetworkInterface><NetworkInterface><id>2</id><Wireless/></NetworkInterface></NetworkInterfaceList>"), "2");
});
test("configureWifi with mocked digest session", async () => {
  const calls: string[] = [];
  const session = { request: async (url: string, method: string) => { calls.push(`${method} ${url.replace(/^http:\/\/[^/]+/, "")}`); return { status: 200, text: "<NetworkInterface><id>1</id></NetworkInterface><NetworkInterface><id>3</id><Wireless/></NetworkInterface>" }; } };
  const r = await configureWifi({ ip: "192.168.1.24", httpPort: 80 }, "Speed2026", { ssid: "Omar", password: "pass1234", security: "WPA2-personal" }, session);
  assert.equal(r.ok, true);
  assert.deepEqual(calls, ["GET /ISAPI/System/Network/interfaces", "PUT /ISAPI/System/Network/interfaces/3/wireless", "PUT /ISAPI/System/Network/interfaces/3/ipAddress"]);
  const bad = await configureWifi({ ip: "x", httpPort: 80 }, "p", { ssid: "Omar", password: "pass1234", security: "WPA2-personal" }, { request: async () => ({ status: 401, text: "" }) });
  assert.match(bad.error, /غلط/);
});
test("raw ethernet SADP frame round trip", () => {
  const payload = Buffer.from("<ProbeMatch><MAC>aa</MAC></ProbeMatch>");
  const frame = sadpEthernetFrame("aa:bb:cc:dd:ee:ff", payload, "192.168.1.9");
  assert.equal(frame.subarray(0, 6).toString("hex"), "01005e7ffffa");
  assert.equal(sadpPayloadFromFrame(frame)?.toString(), payload.toString());
  assert.equal(sadpPayloadFromFrame(Buffer.alloc(60)), null);
});
