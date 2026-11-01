import test from "node:test";
import assert from "node:assert/strict";
import { describeHttpStatus, describeIsapiStatus, describeNetworkError } from "./device-errors.ts";

test("device auth/offline/timeout errors are human", () => {
  assert.match(describeHttpStatus(401), /كلمة سر الجهاز/);
  assert.equal(describeNetworkError(Object.assign(new Error("x"), { code: "ETIMEDOUT" })).code, "DEVICE_TIMEOUT");
  assert.equal(describeNetworkError(Object.assign(new Error("connect"), { code: "EHOSTUNREACH" })).code, "DEVICE_OFFLINE");
  assert.equal(describeNetworkError(new Error("connect ECONNREFUSED 1.2.3.4:80")).code, "DEVICE_OFFLINE");
});
test("ISAPI sub status codes are explained", () => {
  assert.match(describeIsapiStatus(6, "employeeNoAlreadyExist"), /موجود بالفعل/);
  assert.match(describeIsapiStatus(4, "notSupport"), /لا يدعم/);
  assert.match(describeIsapiStatus(6, "weird", "bad"), /subStatusCode=weird/);
});
