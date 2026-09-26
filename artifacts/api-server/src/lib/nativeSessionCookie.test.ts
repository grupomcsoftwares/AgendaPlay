import assert from "node:assert/strict";
import test from "node:test";
import { getNativeSessionCookie, SESSION_COOKIE_NAME } from "./nativeSessionCookie";

test("creates a host-only native session cookie value", () => {
  const cookie = getNativeSessionCookie("session-id", "test-secret");

  assert.ok(cookie);
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=s:session-id\\.`));
  assert.equal(cookie.includes(";"), false);
  assert.equal(cookie.toLowerCase().includes("domain="), false);
  assert.equal(cookie.toLowerCase().includes("path="), false);
});

test("does not create a native cookie without the signing secret", () => {
  assert.equal(getNativeSessionCookie("session-id", undefined), null);
});