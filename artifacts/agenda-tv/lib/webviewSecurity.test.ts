import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedAppUrl,
  isAllowedBillingUrl,
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

test("allows only secure Stripe billing destinations", () => {
  assert.equal(isAllowedBillingUrl("https://checkout.stripe.com/c/pay/session"), true);
  assert.equal(isAllowedBillingUrl("https://billing.stripe.com/p/session"), true);
  assert.equal(isAllowedBillingUrl("https://invoice.stripe.com/i/session"), true);
  assert.equal(isAllowedBillingUrl("https://checkout.stripe.com:443/c/pay/session"), true);

  for (const url of [
    "http://checkout.stripe.com/c/pay/session",
    "https://checkout.stripe.com.evil.example/c/pay/session",
    "https://evil.example/checkout.stripe.com",
    "https://user:pass@billing.stripe.com/session",
    "https://billing.stripe.com:8443/session",
    "javascript:alert(1)",
    "not a URL",
  ]) {
    assert.equal(isAllowedBillingUrl(url), false, url);
  }
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
