import test from "node:test";
import assert from "node:assert/strict";
import { parseProbeMatch, probeXml, isapiFingerprint, subnetHosts } from "./sadp.server.ts";

const reply = `<?xml version="1.0" encoding="UTF-8"?><ProbeMatch><Uuid>X</Uuid><Types>inquiry</Types><DeviceType>852085</DeviceType><DeviceDescription>DS-K1A340WX</DeviceDescription><DeviceSN>DS-K1A340WX2024SN</DeviceSN><CommandPort>8000</CommandPort><HttpPort>80</HttpPort><MAC>60-1D-9D-9F-3A-57</MAC><IPv4Address>192.168.1.21</IPv4Address><SoftwareVersion>V1.2.7build 240228</SoftwareVersion><Activated>true</Activated></ProbeMatch>`;
test("probe xml is an inquiry", () => {
  const xml = probeXml("ABC");
  assert.match(xml, /<Probe><Uuid>ABC<\/Uuid><Types>inquiry<\/Types><\/Probe>/);
});
test("parses ProbeMatch", () => {
  assert.deepEqual(parseProbeMatch(reply, "192.168.1.21"), { source: "sadp", model: "DS-K1A340WX", ip: "192.168.1.21", httpPort: 80, mac: "60-1d-9d-9f-3a-57", serial: "DS-K1A340WX2024SN", firmware: "V1.2.7build 240228", activated: true });
});
test("ignores probes, public IPs and inactive flags parse", () => {
  assert.equal(parseProbeMatch(probeXml()), null);
  assert.equal(parseProbeMatch(reply.replace("192.168.1.21", "8.8.8.8")), null);
  assert.equal(parseProbeMatch(reply.replace("<Activated>true", "<Activated>false"))?.activated, false);
});
test("isapi fingerprint", () => {
  assert.equal(isapiFingerprint(401, 'Digest realm="DS-K1A340WX", nonce="x"', "")?.model, "DS-K1A340WX");
  assert.equal(isapiFingerprint(401, "Basic realm=x", ""), null);
  assert.equal(isapiFingerprint(200, "", "<DeviceInfo><model>DS-X</model></DeviceInfo>")?.model, "DS-X");
  assert.equal(isapiFingerprint(404, "", ""), null);
});
test("subnet hosts", () => {
  const hosts = subnetHosts("192.168.1.9", "255.255.255.0");
  assert.equal(hosts.length, 253);
  assert.ok(!hosts.includes("192.168.1.9") && hosts.includes("192.168.1.21"));
  assert.deepEqual(subnetHosts("10.0.0.1", "255.0.0.0"), []);
});
