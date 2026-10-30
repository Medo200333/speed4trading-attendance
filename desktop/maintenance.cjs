const {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} = require("node:fs");
const { join, relative, resolve, dirname } = require("node:path");
const {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} = require("node:crypto");
const allowed = (path) =>
  /^(?:state\.json|companies\.json|credential-[a-f0-9]{64}\.json|companies\/co-[a-f0-9]{24}\/(?:state\.json|credential-[a-f0-9]{64}\.json))$/.test(
    path,
  );
function key(password, salt) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error("BACKUP_PASSWORD");
  return scryptSync(password, salt, 32);
}
function pack(directory, safeStorage) {
  const files = {};
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const path = join(dir, e.name),
        name = relative(directory, path).replaceAll("\\", "/");
      if (e.isDirectory()) {
        if (name === "companies" || /^companies\/co-[a-f0-9]{24}$/.test(name))
          walk(path);
      } else if (allowed(name))
        files[name] = readFileSync(path).toString("base64");
    }
  }
  walk(directory);
  return {
    format: "zubayd-backup-v1",
    at: new Date().toISOString(),
    files,
    vaultKey: safeStorage.decryptString(
      readFileSync(join(directory, "vault-key.bin")),
    ),
  };
}
async function exportBackup(directory, target, password, safeStorage) {
  const payload = Buffer.from(JSON.stringify(pack(directory, safeStorage))),
    salt = randomBytes(16),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(password, salt), iv);
  cipher.setAAD(Buffer.from("zubayd-backup-v1"));
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  payload.fill(0);
  writeFileSync(
    target,
    JSON.stringify({
      format: "zubayd-backup-v1",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    }),
    { mode: 0o600 },
  );
  return { ok: true };
}
async function decodeBackup(path, password) {
  const raw = readFileSync(path);
  if (raw.length > 100_000_000) throw new Error("BACKUP_LIMIT");
  const envelope = JSON.parse(raw.toString());
  if (envelope.format !== "zubayd-backup-v1") throw new Error("BACKUP_FORMAT");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(password, Buffer.from(envelope.salt, "base64")),
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAAD(Buffer.from("zubayd-backup-v1"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  let data;
  try {
    data = JSON.parse(clear.toString());
  } finally {
    clear.fill(0);
  }
  if (
    data.format !== "zubayd-backup-v1" ||
    typeof data.vaultKey !== "string" ||
    !data.files ||
    !data.files["companies.json"] ||
    !data.files["state.json"] ||
    Object.keys(data.files).length > 10000 ||
    Object.keys(data.files).some((p) => !allowed(p))
  )
    throw new Error("BACKUP_CONTENT");
  const platform = JSON.parse(
    Buffer.from(data.files["companies.json"], "base64"),
  );
  if (
    platform.schemaVersion !== 1 ||
    !Array.isArray(platform.companies) ||
    !Array.isArray(platform.accounts)
  )
    throw new Error("BACKUP_SCHEMA");
  for (const [name, body] of Object.entries(data.files)) {
    const value = JSON.parse(Buffer.from(body, "base64"));
    if (
      name.endsWith("state.json") &&
      (value.schemaVersion !== 1 ||
        !Array.isArray(value.devices) ||
        !Array.isArray(value.events))
    )
      throw new Error("BACKUP_SCHEMA");
  }
  return data;
}
function summary(data) {
  const p = JSON.parse(Buffer.from(data.files["companies.json"], "base64"));
  return {
    createdAt: data.at,
    companies: p.companies.length,
    files: Object.keys(data.files).length,
  };
}
async function inspectBackup(path, password) {
  return summary(await decodeBackup(path, password));
}
async function restoreBackup(directory, data, safeStorage) {
  const root = resolve(directory), parent = dirname(root);
  if (root === require("node:path").parse(root).root) throw new Error("BACKUP_PATH");
  const suffix = randomBytes(8).toString("hex"), stage = join(parent, ".zubayd-restore-" + suffix), previous = root + ".before-restore-" + suffix;
  mkdirSync(stage, { mode: 0o700 });
  for (const [name, body] of Object.entries(data.files)) {
    if (!allowed(name)) throw new Error("BACKUP_PATH");
    const target = resolve(stage, name);
    if (!target.startsWith(stage + require("node:path").sep))
      throw new Error("BACKUP_PATH");
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    const temp = target + ".restore-" + randomBytes(6).toString("hex");
    writeFileSync(temp, Buffer.from(body, "base64"), {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temp, target);
  }
  writeFileSync(
    join(stage, "vault-key.bin"),
    safeStorage.encryptString(data.vaultKey),
    { mode: 0o600 },
  );
  // The caller stops only its own application server before this atomic swap.
  // Keep the entire previous directory, including old credentials, for recovery.
  renameSync(root, previous);
  try { renameSync(stage, root); }
  catch (error) { renameSync(previous, root); throw error; }
  data.vaultKey = "";
  return { ok: true, previousDirectory: previous };
}
module.exports = {
  exportBackup,
  decodeBackup,
  inspectBackup,
  restoreBackup,
  summary,
};
