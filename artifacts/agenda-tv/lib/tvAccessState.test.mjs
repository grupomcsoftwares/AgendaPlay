import assert from "node:assert/strict";
import test from "node:test";
import { getTvBlockedState, tvPageRequiresSession } from "./tvAccessState.ts";

test("an authenticated TV status response with no access is an expired subscription", () => {
  assert.equal(
    getTvBlockedState({
      isTv: true,
      requiresSession: true,
      loading: false,
      user: { canAccess: false },
      accountStatusValidated: true,
    }),
    "subscription-expired",
  );
});

test("a missing TV user is a disconnected session, not an expired subscription", () => {
  assert.equal(
    getTvBlockedState({
      isTv: true,
      requiresSession: true,
      loading: false,
      user: null,
      accountStatusValidated: true,
    }),
    "session-disconnected",
  );
});

test("cached expired status is not shown until the server validates the account", () => {
  assert.equal(
    getTvBlockedState({
      isTv: true,
      requiresSession: true,
      loading: false,
      user: { canAccess: false },
      accountStatusValidated: false,
    }),
    null,
  );
});

test("registration WebViews do not require a TV account session", () => {
  assert.equal(tvPageRequiresSession("https://agendaplay.net/register"), false);
  assert.equal(tvPageRequiresSession("https://agendaplay.net/queue"), true);
  assert.equal(tvPageRequiresSession("https://agendaplay.net/dashboard"), true);
});
