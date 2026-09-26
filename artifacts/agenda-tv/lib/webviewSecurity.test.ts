import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedAppUrl,
  isTrustedWebViewMessageOrigin,
  normalizeAppUrl,
  parseNativePushMessage,
  PROD_BASE,
  PROD_HOSTNAME,
} from "./webviewSecurity";

const appUrl = (path = "/dashboard") => `${PROD_BASE}${path}`;

test("normalizes accepted HTTPS app URLs and preserves route data", () => {
  assert.equal(
    normalizeAppUrl(`${PROD_BASE}/queue?tv=1#current`),
    `${PROD_BASE}/queue?tv=1#current`,
  );
  assert.equal(normalizeAppUrl(`${PROD_BASE}:443/dashboard`), appUrl("/dashboard"));
  assert.equal(normalizeAppUrl(`${PROD_BASE.toUpperCase()}/clients`), appUrl("/clients"));
  assert.equal(normalizeAppUrl(`${PROD_BASE}/dashboard`), appUrl("/dashboard"));
});

test("rejects insecure, off-origin, non-default-port, and credential-bearing URLs", () => {
  assert.equal(normalizeAppUrl(`http://${PROD_HOSTNAME}/dashboard`), null);
  assert.equal(normalizeAppUrl(`https://sub.${PROD_HOSTNAME}/dashboard`), null);
  assert.equal(normalizeAppUrl(`https://example.com/dashboard`), null);
  assert.equal(normalizeAppUrl(`${PROD_BASE}:8443/dashboard`), null);
  assert.equal(normalizeAppUrl(`https://user:password@${PROD_HOSTNAME}/dashboard`), null);
  assert.equal(normalizeAppUrl("not a URL"), null);
  assert.equal(isAllowedAppUrl(undefined), false);
  assert.equal(isAllowedAppUrl(""), false);
});

test("only trusts messages from the current AgendaPlay origin", () => {
  assert.equal(isTrustedWebViewMessageOrigin(appUrl("/dashboard"), appUrl("/dashboard")), true);
  assert.equal(isTrustedWebViewMessageOrigin(appUrl("/dashboard"), appUrl("/queue")), true);
  assert.equal(isTrustedWebViewMessageOrigin(`https://example.com${"/dashboard"}`, appUrl()), false);
  assert.equal(isTrustedWebViewMessageOrigin(undefined, appUrl()), false);
  assert.equal(isTrustedWebViewMessageOrigin(appUrl(), undefined), false);
  assert.equal(isTrustedWebViewMessageOrigin("malformed", appUrl()), false);
});

test("accepts valid native push actions and rejects malformed or augmented messages", () => {
  for (const action of ["subscribe", "unsubscribe", "status"] as const) {
    assert.deepEqual(
      parseNativePushMessage(JSON.stringify({ type: "AGENDAPLAY_NATIVE_PUSH", action })),
      { action },
    );
  }

  for (const raw of [
    "",
    "{",
    "[]",
    JSON.stringify({ type: "OTHER", action: "subscribe" }),
    JSON.stringify({ type: "AGENDAPLAY_NATIVE_PUSH", action: "open-url" }),
    JSON.stringify({ type: "AGENDAPLAY_NATIVE_PUSH", action: "status", extra: true }),
    '{"type":"AGENDAPLAY_NATIVE_PUSH","action":"status","__proto__":"polluted"}',
  ]) {
    assert.equal(parseNativePushMessage(raw), null);
  }
});
