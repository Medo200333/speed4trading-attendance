import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newDevice, type AccessState, type Person } from "./domain";

/**
 * Build-time edition preset (e.g. the Sky Line edition). The generic build ships no seed file.
 * The seed JSON is copied into the installer only by the edition build from a server-only folder;
 * it never lives in git and never contains passwords (device/Teams passwords are asked on first use
 * and stored encrypted by the vault).
 */
export type EditionSeed = {
  edition: string;
  company: { nameAr: string; nameEn: string };
  devices: { id: string; name: string; host: string; port?: number; model?: string; location?: string }[];
  people: { employeeNo: string; name: string; photo?: string }[];
};

export function editionSeed(): EditionSeed | null {
  const file = typeof process !== "undefined" ? process.env.SKYLINE_EDITION_SEED : "";
  if (!file || !existsSync(file)) return null;
  try {
    const seed = JSON.parse(readFileSync(file, "utf8")) as EditionSeed;
    return seed && Array.isArray(seed.devices) && Array.isArray(seed.people) ? seed : null;
  } catch {
    return null;
  }
}

/** Fill a brand-new company state once per installation (marker file in the data root). */
export function applyEditionSeed(state: AccessState): boolean {
  const seed = editionSeed();
  const root = process.env.SKYLINE_ACCESS_DATA_DIR || "";
  if (!seed || !root) return false;
  const marker = join(root, "edition-seeded.json");
  if (existsSync(marker)) return false;
  const now = new Date().toISOString();
  state.devices = seed.devices.map((d) => {
    const device = newDevice(d.id, d.name, d.host, d.port || 80, false);
    if (d.model) device.model = d.model;
    if (d.location) device.location = d.location;
    return device;
  });
  const deviceId = state.devices[0]?.id || "";
  state.people = seed.people.map((p) => ({
    id: `seed-${p.employeeNo}`,
    deviceId,
    employeeNo: p.employeeNo,
    name: p.name,
    userType: "normal",
    validity: null,
    doorRight: "1",
    rightPlan: [],
    verifyMode: "",
    updatedAt: now,
    source: "local",
    localEnabled: true,
    shiftId: "",
    cardCount: null,
    fingerprintCount: null,
    faceCount: null,
    photo: p.photo && /^data:image\/(png|jpe?g|webp);base64,/.test(p.photo) ? p.photo : undefined,
  }) as Person);
  writeFileSync(marker, JSON.stringify({ edition: seed.edition, at: now, devices: state.devices.length, people: state.people.length }), { mode: 0o600 });
  return true;
}
