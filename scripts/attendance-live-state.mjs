import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const directory =
  process.env.SKYLINE_ACCESS_DATA_DIR ||
  join(process.env.LOCALAPPDATA || homedir(), "SKYLINE", "access-control");
const file = join(directory, "state.json");
const state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
console.log(
  JSON.stringify(
    {
      at: new Date().toISOString(),
      stateAvailable: existsSync(file),
      credentialsInThisProcess: Boolean(
        process.env.HIKVISION_USERNAME && process.env.HIKVISION_PASSWORD,
      ),
      vaultKeyInThisProcess: Boolean(process.env.SKYLINE_VAULT_KEY),
      devices: (state.devices || []).map((d) => ({
        id: d.id,
        host: d.host,
        port: d.port,
        model: d.model,
        firmware: d.firmware,
        status: d.status,
        lastSync: d.lastSync,
        eventCapability: d.capabilities?.find((c) => c.feature === "events"),
        users: (state.people || []).filter((p) => p.deviceId === d.id).length,
        events: (state.events || []).filter((e) => e.deviceId === d.id).length,
        years: [
          ...new Set(
            (state.events || [])
              .filter((e) => e.deviceId === d.id)
              .map((e) => e.date?.slice(0, 4)),
          ),
        ],
        sync: d.sync,
      })),
    },
    null,
    2,
  ),
);
