import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const root =
  process.env.SKYLINE_ACCESS_DATA_DIR ||
  join(process.env.LOCALAPPDATA || homedir(), "SKYLINE", "access-control");
const state = existsSync(join(root, "state.json"))
  ? JSON.parse(readFileSync(join(root, "state.json"), "utf8"))
  : {};
const devices = (state.devices || []).map((d) => ({
  id: d.id,
  model: d.model,
  firmware: d.firmware,
  checkedAt: d.checkedAt,
  capabilities: d.capabilities.filter((c) => /face|finger/i.test(c.feature)),
  probes: d.probes
    .filter((p) =>
      /FDLib|FingerPrint|AccessControl\/capabilities$/.test(p.endpoint),
    )
    .map((p) => ({
      endpoint: p.endpoint,
      http: p.http,
      checkedAt: p.checkedAt,
      reason: p.reason,
      fields: Object.fromEntries(
        Object.entries(p.fields).filter(
          ([k]) =>
            /support|face|finger|FDLib|FDID|recordData|Max|Format|Pic|Reader/i.test(
              k,
            ) && !/data\.|password|URL|secret|token/i.test(k),
        ),
      ),
    })),
}));
const result = {
  at: new Date().toISOString(),
  source: "cached-read-only-probes",
  credentialsAvailable: Boolean(
    process.env.HIKVISION_USERNAME && process.env.HIKVISION_PASSWORD,
  ),
  devices,
};
writeFileSync(
  ".codex-backups/biometrics-20261022/cached-capabilities.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
