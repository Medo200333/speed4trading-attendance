import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { createAccessFixture } from "./access-test-device.mjs";

test("capability-gated center persists original events and requires role, session-bound confirmation and readback", async () => {
  const directory = mkdtempSync(join(tmpdir(), "skyline-access-unit-"));
  process.env.SKYLINE_ACCESS_DATA_DIR = directory;
  process.env.SKYLINE_DISABLE_SCHEDULER = "1";
  process.env.SPEED_DEVICE_WRITES = "1";
  process.env.SKYLINE_VAULT_KEY = "fixture-vault-key-not-a-real-secret";
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, watch: null },
    appType: "custom",
  });
  const fixture = await createAccessFixture();
  const actor = {
    username: "fixture-admin",
    name: "fixture",
    role: "admin",
    sessionId: "fixture-session-a",
  };
  try {
    const store = await vite.ssrLoadModule("/src/lib/access/store.server.ts");
    const service = await vite.ssrLoadModule(
      "/src/lib/access/service.server.ts",
    );
    const adapter = await vite.ssrLoadModule("/src/lib/access/isapi.server.ts");
    await store.updateState((state) =>
      Object.assign(state.devices[0], {
        host: fixture.link.host,
        port: fixture.link.port,
      }),
    );
    await service.actionCenter(actor, {
      action: "connect",
      deviceId: "hikvision-main",
      username: fixture.link.username,
      password: fixture.link.password,
    });
    let state = await store.readState();
    assert.equal(state.devices[0].status, "online");
    assert.equal(state.devices[0].info.manufacturer, "Hikvision fixture");
    assert.equal(state.devices[0].info.firmwareBuildDate, "2023-09-27");
    assert.equal(state.devices[0].info.userCount, 2);
    assert.deepEqual(state.devices[0].physicalDoorIds, [1]);
    assert.equal(
      state.devices[0].capabilities.find((row) => row.feature === "users.add")
        .state,
      "supported",
    );
    assert.equal(
      state.devices[0].capabilities.find((row) => row.feature === "faces")
        .state,
      "unsupported",
    );
    assert.equal(
      state.devices[0].capabilities.find((row) => row.feature === "dst").state,
      "unsupported",
    );
    assert.equal(
      fixture.mutations.length,
      0,
      "GET capabilities must never write",
    );
    // Regression (192.168.1.111): an optional capability path answering 401 must not fail connect.
    fixture.faults.capability401 = true;
    await service.actionCenter(actor, {
      action: "connect",
      deviceId: "hikvision-main",
      username: fixture.link.username,
      password: fixture.link.password,
    });
    assert.equal((await store.readState()).devices[0].status, "online");
    fixture.faults.capability401 = false;
    await assert.rejects(
      service.actionCenter(actor, {
        action: "connect",
        deviceId: "hikvision-main",
        username: fixture.link.username,
        password: "wrong-fixture-password",
      }),
    );
    assert.equal(
      (await store.credential("hikvision-main")).password,
      fixture.link.password,
      "failed connection test must retain the working credential",
    );
    await service.actionCenter(actor, {
      action: "probe",
      deviceId: "hikvision-main",
    });
    await service.synchronize(
      actor,
      "hikvision-main",
      "2015-01-01",
      "2015-01-02",
    );
    state = await store.readState();
    assert.equal(state.people.length, 2);
    assert.equal(state.events.length, 56);
    assert.equal(
      state.events.filter((event) => event.category === "verification").length,
      24,
    );
    assert.ok(
      state.events.every(
        (event) =>
          event.date.startsWith("2015") && event.originalOffset === "+08:00",
      ),
    );
    await service.synchronize(
      actor,
      "hikvision-main",
      "2015-01-01",
      "2015-01-02",
    );
    state = await store.readState();
    assert.equal(state.events.length, 56, "second import must be idempotent");
    assert.equal(state.devices[0].sync.duplicates, 57);
    assert.equal(fixture.mutations.length, 0, "sync searches must never write");
    const operation = {
      kind: "addPerson",
      deviceId: "hikvision-main",
      person: {
        employeeNo: "3",
        name: "Test User",
        begin: "2026-01-01",
        end: "2037-12-31",
        permanent: false,
      },
    };
    await assert.rejects(
      service.prepareOperation({ ...actor, role: "viewer" }, operation),
      (error) => error.code === "FORBIDDEN",
    );
    await assert.rejects(
      service.prepareOperation({ ...actor, role: "operator" }, operation),
      (error) => error.code === "FORBIDDEN",
    );
    const preview = await service.prepareOperation(actor, operation);
    assert.equal(fixture.mutations.length, 0);
    await assert.rejects(
      service.commitOperation(actor, preview.token, "wrong phrase"),
      (error) => error.code === "CONFIRMATION",
    );
    await assert.rejects(
      service.commitOperation(
        { ...actor, sessionId: "other-session" },
        preview.token,
        preview.phrase,
      ),
      (error) => error.code === "CONFIRMATION",
    );
    assert.equal(fixture.mutations.length, 0);
    await service.commitOperation(actor, preview.token, preview.phrase);
    assert.equal(fixture.mutations.length, 1);
    assert.ok(
      (await store.readState()).people.some(
        (person) => person.employeeNo === "3",
      ),
    );
    await assert.rejects(
      service.commitOperation(actor, preview.token, preview.phrase),
      (error) => error.code === "CONFIRMATION",
    );
    await assert.rejects(
      service.prepareOperation(actor, operation),
      (error) => error.code === "DUPLICATE",
    );
    const disable = await service.prepareOperation(actor, {
      kind: "disablePerson",
      deviceId: "hikvision-main",
      employeeNo: "3",
    });
    await service.commitOperation(actor, disable.token, disable.phrase);
    const disabled = (await store.readState()).people.find(
      (person) => person.employeeNo === "3",
    );
    assert.equal(disabled.validity.enable, true);
    assert.ok(disabled.validity.endTime.startsWith("2000-01-02"));
    const card = await service.prepareOperation(actor, {
      kind: "addCard",
      deviceId: "hikvision-main",
      employeeNo: "3",
      cardNo: "77778888",
    });
    await service.commitOperation(actor, card.token, card.phrase);
    assert.ok(fixture.cards.some((card) => card.cardNo === "77778888"));
    const removeCard = await service.prepareOperation(actor, {
      kind: "deleteCard",
      deviceId: "hikvision-main",
      employeeNo: "3",
      cardNo: "77778888",
    });
    await service.commitOperation(actor, removeCard.token, removeCard.phrase);
    assert.ok(!fixture.cards.some((card) => card.cardNo === "77778888"));
    await assert.rejects(
      service.prepareOperation(actor, {
        kind: "deleteCard",
        deviceId: "hikvision-main",
        employeeNo: "3",
        cardNo: "1234567890",
      }),
      (error) => error.code === "CARD_OWNER",
    );
    // The exact card filter must work even when the employee has more than one page of cards.
    fixture.cards.push(
      ...Array.from({ length: 40 }, (_, index) => ({
        employeeNo: "3",
        cardNo: `900${index}`,
        cardType: "normalCard",
      })),
    );
    const laterCard = await service.prepareOperation(actor, {
      kind: "deleteCard",
      deviceId: "hikvision-main",
      employeeNo: "3",
      cardNo: "90039",
    });
    await service.commitOperation(actor, laterCard.token, laterCard.phrase);
    assert.ok(!fixture.cards.some((card) => card.cardNo === "90039"));
    const originalSchedule = await service.queryCenter(actor, {
      action: "schedule",
      deviceId: "hikvision-main",
      templateNo: 1,
    });
    assert.equal(originalSchedule.schedule.template.weekPlanNo, 1);
    await service.actionCenter(actor, {
      action: "plan.save",
      deviceId: "hikvision-main",
      name: "جدول اختبار",
      templateNo: 1,
      week: [{ day: "Monday", start: "22:00", end: "06:00" }],
      holidays: [],
    });
    const plan = (await store.readState()).plans[0];
    const staleWeek = await service.prepareOperation(actor, {
      kind: "applyWeek",
      deviceId: "hikvision-main",
      planId: plan.id,
    });
    fixture.weekPlans.get(1).WeekPlanCfg[0].TimeSegment.endTime = "16:00:00";
    const beforeStale = fixture.mutations.length;
    await assert.rejects(
      service.commitOperation(actor, staleWeek.token, staleWeek.phrase),
      (error) => error.code === "STALE",
    );
    assert.equal(
      fixture.mutations.length,
      beforeStale,
      "changed device schedule must prevent writes",
    );
    const weekPreview = await service.prepareOperation(actor, {
      kind: "applyWeek",
      deviceId: "hikvision-main",
      planId: plan.id,
    });
    assert.ok(
      weekPreview.warnings.some((warning) =>
        warning.includes("جميع المستخدمين"),
      ),
    );
    await service.commitOperation(actor, weekPreview.token, weekPreview.phrase);
    const periods = fixture.weekPlans
      .get(1)
      .WeekPlanCfg.filter((row) => row.enable);
    assert.equal(periods.length, 2);
    assert.equal(periods[0].week, "Monday");
    assert.equal(periods[1].week, "Tuesday");
    assert.ok(
      readdirSync(directory).some((file) =>
        file.startsWith("schedule-before-"),
      ),
    );
    const permission = await service.prepareOperation(actor, {
      kind: "permission",
      deviceId: "hikvision-main",
      employeeNo: "3",
      doorNos: [1],
      templateNo: 1,
    });
    await service.commitOperation(actor, permission.token, permission.phrase);
    await assert.rejects(
      service.prepareOperation(actor, {
        kind: "pin",
        deviceId: "hikvision-main",
        employeeNo: "3",
        pin: "918273",
      }),
      (error) => error.code === "SECURE_TRANSPORT",
    );
    const door = await service.prepareOperation(actor, {
      kind: "door",
      deviceId: "hikvision-main",
      doorNo: 1,
      command: "open",
    });
    const beforeDoor = fixture.mutations.length;
    assert.equal(fixture.mutations.length, beforeDoor);
    await service.commitOperation(actor, door.token, door.phrase);
    assert.equal(
      fixture.mutations.at(-1).path,
      "/ISAPI/AccessControl/RemoteControl/door/1",
    );
    await assert.rejects(
      service.prepareOperation(actor, {
        kind: "door",
        deviceId: "hikvision-main",
        doorNo: 99,
        command: "open",
      }),
      (error) => error.code === "DOOR",
    );
    const remove = await service.prepareOperation(actor, {
      kind: "deletePerson",
      deviceId: "hikvision-main",
      employeeNo: "3",
    });
    await service.commitOperation(actor, remove.token, remove.phrase);
    state = await store.readState();
    assert.ok(!state.people.some((person) => person.employeeNo === "3"));
    assert.equal(
      state.events.length,
      56,
      "historical events must survive user deletion",
    );
    const serialized = JSON.stringify(await service.snapshot(actor));
    assert.ok(!serialized.includes(fixture.link.password));
    assert.ok(!serialized.includes("918273"));
    assert.ok(!serialized.includes('"hash"'));
    const vault = readdirSync(directory).find((file) =>
      file.startsWith("credential-"),
    );
    assert.ok(vault);
    assert.ok(
      !readFileSync(join(directory, vault), "utf8").includes(
        fixture.link.password,
      ),
    );
    store.runtime().secrets.clear();
    assert.equal(
      (await store.credential("hikvision-main")).password,
      fixture.link.password,
    );
    const batch = await service.prepareOperation(actor, { kind: "importPeople", deviceId: "hikvision-main", people: ["4", "5"].map((employeeNo) => ({ employeeNo, name: `Batch Employee ${employeeNo}`, begin: "2026-01-01", end: "2037-12-31", permanent: false })) });
    const beforeBatch = fixture.mutations.length;
    await service.commitOperation(actor, batch.token, batch.phrase);
    assert.equal(fixture.mutations.length, beforeBatch + 2);
    assert.equal((await store.readState()).audit.filter((row) => row.action === "import.person" && row.result === "success").length, 2);
    fixture.faults.emptyUserCapabilities = true;
    await service.actionCenter(actor, {
      action: "probe",
      deviceId: "hikvision-main",
    });
    assert.equal(
      (await store.readState()).devices[0].capabilities.find(
        (row) => row.feature === "users.add",
      ).state,
      "unverified",
      "status-only OK must not prove a capability",
    );
    process.env.SKYLINE_ADMIN_USERNAME = "disabled-fixture";
    process.env.SKYLINE_ADMIN_PASSWORD = "disabled-fixture-test-password";
    await store.updateState((state) =>
      state.accounts.push({
        username: "disabled-fixture",
        name: "fixture",
        role: "admin",
        enabled: false,
        ...store.passwordHash("other-fixture-password"),
      }),
    );
    assert.equal(
      await store.authenticate(
        "disabled-fixture",
        process.env.SKYLINE_ADMIN_PASSWORD,
      ),
      null,
      "environment fallback must not bypass a disabled stored account",
    );
    store
      .runtime()
      .sessions.set("disabled-session", {
        username: "disabled-fixture",
        until: Date.now() + 60000,
      });
    assert.equal(await store.resolveSession("disabled-session"), null);
    delete process.env.SKYLINE_ADMIN_USERNAME;
    delete process.env.SKYLINE_ADMIN_PASSWORD;
    // Accountant: reports and transactions only.
    const accountant = { ...actor, role: "accountant", sessionId: "fixture-session-acc" };
    const accSnap = await service.queryCenter(accountant, { action: "snapshot" });
    assert.ok(accSnap.snapshot);
    await service.queryCenter(accountant, { action: "events", page: 0 });
    await service.queryCenter(accountant, { action: "attendance", start: "2015-01-01", end: "2015-01-02" });
    await assert.rejects(service.queryCenter(accountant, { action: "schedule", deviceId: "hikvision-main", templateNo: 1 }), (e) => e.code === "FORBIDDEN");
    await assert.rejects(service.actionCenter(accountant, { action: "sync", deviceId: "hikvision-main" }), (e) => e.code === "FORBIDDEN");
    // Bulk delete: one typed confirmation, audited per person, accountant forbidden.
    {
      const before = await store.readState();
      const nos = before.people.filter((p) => p.deviceId === "hikvision-main").slice(0, 2).map((p) => p.employeeNo);
      assert.equal(nos.length, 2);
      await assert.rejects(service.prepareOperation(accountant, { kind: "deletePeople", deviceId: "hikvision-main", employeeNos: nos }), (e) => e.code === "FORBIDDEN");
      await assert.rejects(service.prepareOperation(actor, { kind: "deletePeople", deviceId: "hikvision-main", employeeNos: [nos[0], nos[0]] }), (e) => e.code === "DUPLICATE");
      const bulk = await service.prepareOperation(actor, { kind: "deletePeople", deviceId: "hikvision-main", employeeNos: nos });
      assert.equal(bulk.affected, 2);
      assert.equal(bulk.phrase, "تأكيد حذف 2 مستخدم");
      await assert.rejects(service.commitOperation(actor, bulk.token, "wrong"));
      const again = await service.prepareOperation(actor, { kind: "deletePeople", deviceId: "hikvision-main", employeeNos: nos });
      await service.commitOperation(actor, again.token, again.phrase);
      const after = await store.readState();
      assert.ok(!after.people.some((p) => p.deviceId === "hikvision-main" && nos.includes(p.employeeNo)));
      for (const no of nos) assert.ok(after.audit.some((a) => a.action === "delete.person" && a.target === `hikvision-main:${no}` && a.result === "success"));
    }
    await assert.rejects(service.prepareOperation(accountant, { kind: "door", deviceId: "hikvision-main", doorNo: 1, command: "open" }), (e) => e.code === "FORBIDDEN");
    // Optional read-only lock (SPEED_DEVICE_WRITES=0): every device write is refused before reaching the device.
    process.env.SPEED_DEVICE_WRITES = "0";
    const before = fixture.mutations.length;
    await assert.rejects(service.prepareOperation(actor, { kind: "door", deviceId: "hikvision-main", doorNo: 1, command: "open" }), (e) => e.code === "READ_ONLY");
    await assert.rejects(service.commitOperation(actor, "x", "y"), (e) => e.code === "READ_ONLY");
    assert.equal((await service.queryCenter(actor, { action: "snapshot" })).snapshot.deviceWrites, false);
    assert.equal(fixture.mutations.length, before, "read-only mode never writes");
    process.env.SPEED_DEVICE_WRITES = "1";
  } finally {
    await fixture.close();
    await vite.close();
  }
});

test("attendance distinguishes overnight work, excessive spans and old timestamps", async () => {
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, watch: null },
    appType: "custom",
  });
  try {
    const domain = await vite.ssrLoadModule("/src/lib/access/domain.ts");
    const initial = domain.initialState();
    const person = {
      id: "d:1",
      deviceId: "d",
      employeeNo: "1",
      name: "fixture",
      localEnabled: true,
      shiftId: "night",
    };
    const event = (time, serialNo) =>
      domain.normalizeEvent(
        { major: 5, minor: 38, employeeNoString: "1", time, serialNo },
        { id: "d", serial: "fixture" },
        "2026-10-22T00:00:00Z",
      );
    const night = {
      id: "night",
      name: "ليلي",
      start: "22:00",
      end: "06:00",
      graceMinutes: 10,
      earlyGraceMinutes: 10,
      maxHours: 14,
      days: [0, 1, 2, 3, 4, 5, 6],
    };
    const rules = { ...initial.rules, shifts: [night] };
    const rows = domain.attendanceReport(
      [
        event("2026-10-21T21:58:00+03:00", 1),
        event("2026-10-22T06:02:00+03:00", 2),
      ],
      [person],
      rules,
      "2026-10-21",
      "2026-10-21",
    );
    assert.equal(rows[0].minutes, 484);
    assert.equal(rows[0].date, "2026-10-21");
    assert.equal(rows[0].exception, false);
    const dayRules = {
      ...rules,
      shifts: [{ ...night, id: "night", start: "08:00", end: "16:00" }],
    };
    const long = domain.attendanceReport(
      [
        event("2026-10-21T00:30:00+03:00", 3),
        event("2026-10-21T19:30:00+03:00", 4),
      ],
      [person],
      dayRules,
      "2026-10-21",
      "2026-10-21",
    );
    assert.equal(long[0].minutes, null);
    assert.equal(long[0].overtimeMinutes, null);
    const policyRules = { ...dayRules, shifts: [{ ...dayRules.shifts[0], breakMinutes: 30, overtimeEnabled: true, overtimeGraceMinutes: 0 }] };
    const policyRows = domain.attendanceReport([event("2026-10-21T08:00:00+03:00", 101), event("2026-10-21T17:00:00+03:00", 102)], [person], policyRules, "2026-10-21", "2026-10-21");
    assert.equal(policyRows[0].grossMinutes, 540);
    assert.equal(policyRows[0].breakMinutes, 30);
    assert.equal(policyRows[0].minutes, 510);
    assert.equal(policyRows[0].overtimeMinutes, 60);
    assert.ok(long[0].status.includes("غير منطقية"));
    const historical = event("2015-01-01T08:15:00+08:00", 5);
    assert.equal(event("2026-02-30T08:15:00+03:00", 99).validTime, false);
    assert.equal(historical.originalTimestamp, "2015-01-01T08:15:00+08:00");
    assert.equal(historical.time, "02:15:00", "device time is shown in Cairo time");
    const current = domain.attendanceReport(
      [historical],
      [person],
      dayRules,
      "2026-10-21",
      "2026-10-21",
    );
    assert.equal(current[0].count, 0);
    assert.equal(current[0].status, "غياب");
    const holidays = domain.attendanceReport(
      [],
      [person],
      { ...dayRules, holidays: [{ date: "2026-10-21", name: "عطلة" }] },
      "2026-10-21",
      "2026-10-21",
    );
    assert.equal(holidays[0].exception, false);
  } finally {
    await vite.close();
  }
});
