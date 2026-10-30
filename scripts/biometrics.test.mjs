import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { createBiometricFixture } from "./biometric-test-device.mjs";
// Synthetic JPEG envelope for API contract tests only; not a picture of a person.
const photo = Buffer.from([
  255, 216, 255, 224, 0, 4, 0, 0, 255, 192, 0, 11, 8, 2, 128, 1, 224, 1, 1, 17,
  0, 255, 218, 0, 2, 0, 255, 217,
]);
const admin = {
  username: "bio-admin",
  name: "fixture",
  role: "admin",
  sessionId: "bio-session",
};
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "skyline-bio-test-"));
  process.env.SKYLINE_ACCESS_DATA_DIR = directory;
  process.env.SKYLINE_DISABLE_SCHEDULER = "1";
  delete process.env.SKYLINE_VAULT_KEY;
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, watch: null },
    appType: "custom",
  });
  const fixture = await createBiometricFixture(photo),
    store = await vite.ssrLoadModule("/src/lib/access/store.server.ts"),
    api = await vite.ssrLoadModule("/src/lib/access/isapi.server.ts"),
    bio = await vite.ssrLoadModule("/src/lib/access/biometrics.server.ts");
  await store.updateState((s) => {
    Object.assign(s.devices[0], {
      host: fixture.link.host,
      port: fixture.link.port,
      model: "DS-K1A340WX",
      serial: "BIO-FIXTURE",
      firmware: "V1.2.7",
      checkedAt: new Date().toISOString(),
    });
    s.people = fixture.users.map((r) =>
      api.personFromDevice(r, "hikvision-main"),
    );
  });
  await store.rememberCredential(
    "hikvision-main",
    fixture.link.username,
    fixture.link.password,
  );
  return {
    vite,
    fixture,
    store,
    bio,
    directory,
    close: async () => {
      await fixture.close();
      await vite.close();
    },
  };
}
const input = {
  deviceId: "hikvision-main",
  employeeNo: "1",
  source: "phone",
  photo: photo.toString("base64"),
  replaceExisting: false,
};
async function finish(bio, jobId) {
  for (let i = 0; i < 500; i++) {
    const result = bio.biometricJob(admin, jobId);
    if (result.phase !== "running") return result;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("fixture job did not complete");
}
test("bare FDLib supportFDFunction is supported; no fingerprint hardware; inspection never enrolls", async () => {
  const c = await setup();
  try {
    const state = await c.bio.inspectBiometrics(
      admin,
      input.deviceId,
      input.employeeNo,
    );
    assert.equal(state.upload.state, "ready");
    assert.equal(state.capture.state, "ready");
    assert.equal(state.fingerprint.state, "unsupported");
    assert.equal(state.facePresent, false);
    assert.equal(state.libraries[0].FDID, "face-library-a");
    assert.equal(
      (await c.store.readState()).devices[0].capabilities.find(
        (c) => c.feature === "faces",
      ).state,
      "supported",
    );
    assert.equal(c.fixture.mutations.length, 0);
    await assert.rejects(
      c.bio.prepareBiometric({ ...admin, role: "operator" }, input),
      (e) => e.code === "FORBIDDEN",
    );
    assert.equal(c.fixture.mutations.length, 0);
  } finally {
    await c.close();
  }
});
test("photo stays in memory, session-bound confirmation, exact FPID/library and mandatory readback", async () => {
  const c = await setup();
  try {
    const prepared = await c.bio.prepareBiometric(admin, input);
    assert.equal(c.fixture.mutations.length, 0);
    await assert.rejects(
      c.bio.commitBiometric(
        { ...admin, sessionId: "other" },
        prepared.token,
        prepared.phrase,
      ),
      (e) => e.code === "CONFIRMATION",
    );
    await assert.rejects(
      c.bio.commitBiometric(admin, prepared.token, "wrong"),
      (e) => e.code === "CONFIRMATION",
    );
    const { jobId } = await c.bio.commitBiometric(
      admin,
      prepared.token,
      prepared.phrase,
    );
    const result = await finish(c.bio, jobId);
    assert.equal(result.phase, "verified");
    assert.equal(c.fixture.mutations.length, 1);
    assert.equal(c.fixture.bodies[0].metadata.FPID, "1");
    assert.equal(c.fixture.bodies[0].metadata.FDID, "face-library-a");
    assert.equal(c.fixture.bodies[0].metadata.faceLibType, "blackFD");
    assert.deepEqual(Buffer.from(c.fixture.bodies[0].image), photo);
    await assert.rejects(
      c.bio.commitBiometric(admin, prepared.token, prepared.phrase),
      (e) => e.code === "CONFIRMATION",
    );
    assert.throws(
      () => c.bio.biometricJob({ ...admin, sessionId: "other" }, jobId),
      (e) => e.code === "BIO_JOB",
    );
    const state = await c.store.readState();
    assert.equal(state.people.find((p) => p.employeeNo === "1").faceCount, 1);
    assert.ok(
      state.audit.some(
        (a) => a.action === "face.enroll" && a.result === "success",
      ),
    );
    for (const file of readdirSync(c.directory)) {
      if (!file.endsWith(".json")) continue;
      const text = readFileSync(join(c.directory, file), "utf8");
      assert.ok(!text.includes(photo.toString("base64")));
      assert.ok(!text.includes("PRIVATE-MODEL-NEVER-EXPOSE"));
      assert.ok(!text.includes(c.fixture.link.password));
    }
  } finally {
    await c.close();
  }
});
test("terminal capture starts only after confirmation, polls JPEG binary and applies to the selected employee", async () => {
  const c = await setup();
  try {
    const prepared = await c.bio.prepareBiometric(admin, {
      ...input,
      employeeNo: "2",
      source: "terminal",
      photo: undefined,
    });
    assert.equal(c.fixture.mutations.length, 0);
    const { jobId } = await c.bio.commitBiometric(
      admin,
      prepared.token,
      prepared.phrase,
    );
    const result = await finish(c.bio, jobId);
    assert.equal(result.phase, "verified");
    assert.deepEqual(
      c.fixture.mutations.map((m) => m.path),
      [
        "/ISAPI/AccessControl/CaptureFaceData",
        "/ISAPI/Intelligent/FDLib/FaceDataRecord",
      ],
    );
    assert.equal(c.fixture.bodies[0].metadata.FPID, "2");
    assert.ok(c.fixture.getCaptureReads() > 0);
  } finally {
    await c.close();
  }
});
test("failed/ignored write and unchanged replacement never claim verified; explicit replacement and cancel", async () => {
  const c = await setup();
  try {
    c.fixture.faults.ignoreWrite = true;
    let prepared = await c.bio.prepareBiometric(admin, input),
      job = await c.bio.commitBiometric(admin, prepared.token, prepared.phrase);
    assert.equal((await finish(c.bio, job.jobId)).phase, "uncertain");
    c.fixture.faults.ignoreWrite = false;
    c.fixture.faults.zeroFaceCount = true;
    prepared = await c.bio.prepareBiometric(admin, {
      ...input,
      employeeNo: "2",
    });
    job = await c.bio.commitBiometric(admin, prepared.token, prepared.phrase);
    assert.equal((await finish(c.bio, job.jobId)).phase, "uncertain");
    c.fixture.faults.zeroFaceCount = false;
    c.fixture.faces.set("face-library-a:1", { rowKey: "original-key" });
    await assert.rejects(
      c.bio.prepareBiometric(admin, input),
      (e) => e.code === "FACE_EXISTS",
    );
    prepared = await c.bio.prepareBiometric(admin, {
      ...input,
      replaceExisting: true,
    });
    await c.bio.cancelBiometric(admin, prepared.token);
    const before = c.fixture.mutations.length;
    await assert.rejects(
      c.bio.commitBiometric(admin, prepared.token, prepared.phrase),
      (e) => e.code === "CONFIRMATION",
    );
    assert.equal(c.fixture.mutations.length, before);
    c.fixture.faults.unchangedProof = true;
    prepared = await c.bio.prepareBiometric(admin, {
      ...input,
      replaceExisting: true,
    });
    job = await c.bio.commitBiometric(admin, prepared.token, prepared.phrase);
    assert.equal((await finish(c.bio, job.jobId)).phase, "uncertain");
  } finally {
    await c.close();
  }
});
test("identity/face binding mismatch, no library, bad photo and stale confirmation fail closed", async () => {
  const c = await setup();
  try {
    c.fixture.faults.noLibrary = true;
    await assert.rejects(
      c.bio.prepareBiometric(admin, input),
      (e) => e.code === "BIO_CAPABILITY",
    );
    c.fixture.faults.noLibrary = false;
    await assert.rejects(
      c.bio.prepareBiometric(admin, {
        ...input,
        photo: Buffer.from("not jpeg").toString("base64"),
      }),
      (e) => e.code === "PHOTO",
    );
    await assert.rejects(
      c.bio.prepareBiometric(admin, { ...input, employeeNo: "999" }),
      (e) => e.code === "PERSON",
    );
    const prepared = await c.bio.prepareBiometric(admin, input);
    c.fixture.faces.set("face-library-a:1", {
      rowKey: "changed-after-preview",
    });
    const { jobId } = await c.bio.commitBiometric(
      admin,
      prepared.token,
      prepared.phrase,
    );
    assert.equal((await finish(c.bio, jobId)).phase, "failed");
    assert.equal(c.fixture.mutations.length, 0);
    c.fixture.faults.wrongBinding = true;
    await assert.rejects(
      c.bio.inspectBiometrics(admin, input.deviceId, input.employeeNo),
      (e) => e.code === "BIO_BINDING",
    );
    c.fixture.faults.wrongBinding = false;
    await c.store.updateState((s) => {
      s.devices[0].serial = "ANOTHER-DEVICE";
    });
    await assert.rejects(
      c.bio.prepareBiometric(admin, input),
      (e) => e.code === "IDENTITY",
    );
    assert.equal(c.fixture.mutations.length, 0);
  } finally {
    await c.close();
  }
});
test("expired confirmation, capture stop and device quality rejection never become verified", async () => {
  const c = await setup();
  try {
    let prepared = await c.bio.prepareBiometric(admin, input);
    const now = Date.now;
    try {
      Date.now = () => now() + 121000;
      await assert.rejects(
        c.bio.commitBiometric(admin, prepared.token, prepared.phrase),
        (e) => e.code === "CONFIRMATION",
      );
    } finally {
      Date.now = now;
    }
    assert.equal(c.fixture.mutations.length, 0);
    prepared = await c.bio.prepareBiometric(admin, {
      ...input,
      source: "terminal",
      photo: undefined,
    });
    let job = await c.bio.commitBiometric(
      admin,
      prepared.token,
      prepared.phrase,
    );
    await c.bio.stopBiometric(admin, job.jobId);
    assert.equal((await finish(c.bio, job.jobId)).phase, "failed");
    assert.equal(c.fixture.bodies.length, 0);
    c.fixture.faults.qualityReject = true;
    prepared = await c.bio.prepareBiometric(admin, input);
    job = await c.bio.commitBiometric(admin, prepared.token, prepared.phrase);
    const status = await finish(c.bio, job.jobId);
    assert.equal(status.phase, "failed");
    assert.match(status.message, /جودة صورة الوجه/);
  } finally {
    await c.close();
  }
});
test("deepMode blocks phone-only recognition and routes terminal infrared capture to actual IR library", async () => {
  const c = await setup();
  try {
    c.fixture.faults.mode = "deepMode";
    const status = await c.bio.inspectBiometrics(
      admin,
      input.deviceId,
      input.employeeNo,
    );
    assert.equal(status.upload.state, "needs-device");
    assert.equal(status.capture.state, "ready");
    await assert.rejects(
      c.bio.prepareBiometric(admin, input),
      (e) => e.code === "BIO_CAPABILITY",
    );
    const prepared = await c.bio.prepareBiometric(admin, {
        ...input,
        source: "terminal",
        photo: undefined,
      }),
      job = await c.bio.commitBiometric(admin, prepared.token, prepared.phrase);
    assert.equal((await finish(c.bio, job.jobId)).phase, "verified");
    assert.equal(c.fixture.bodies[0].metadata.FDID, "ir-library-b");
    assert.match(c.fixture.mutations[0].body.xml, /<captureInfrared>true/);
  } finally {
    await c.close();
  }
});
test("firmware without isInLibrary verifies via modelData; rotating faceURL is not STALE; existing face on add falls back to FDSetUp", async () => {
  const c = await setup();
  try {
    c.fixture.faults.noIsInLibrary = true;
    let prepared = await c.bio.prepareBiometric(admin, input),
      job = await c.bio.commitBiometric(admin, prepared.token, prepared.phrase);
    assert.equal((await finish(c.bio, job.jobId)).phase, "verified");
    c.fixture.faults.rotatingUrl = true;
    prepared = await c.bio.prepareBiometric(admin, { ...input, replaceExisting: true });
    job = await c.bio.commitBiometric(admin, prepared.token, prepared.phrase);
    assert.equal((await finish(c.bio, job.jobId)).phase, "verified");
    c.fixture.faults.existsOnAdd = true;
    prepared = await c.bio.prepareBiometric(admin, { ...input, employeeNo: "2" });
    job = await c.bio.commitBiometric(admin, prepared.token, prepared.phrase);
    assert.equal((await finish(c.bio, job.jobId)).phase, "verified");
    assert.deepEqual(
      c.fixture.mutations.slice(-2).map((m) => m.path),
      ["/ISAPI/Intelligent/FDLib/FaceDataRecord", "/ISAPI/Intelligent/FDLib/FDSetUp"],
    );
  } finally {
    await c.close();
  }
});
