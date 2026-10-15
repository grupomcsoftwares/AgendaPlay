import assert from "node:assert/strict";
import test from "node:test";
import { buildRescheduleDays } from "./rescheduleWindow.ts";

test("reschedule picker includes today and stops before the max-window boundary", () => {
  const days = buildRescheduleDays(new Date(2026, 9, 15), 7);

  assert.equal(days.length, 7);
  assert.equal(days[0].key, "2026-10-15");
  assert.equal(days.at(-1)?.key, "2026-10-21");
});

test("reschedule picker follows larger configured windows", () => {
  const days = buildRescheduleDays(new Date(2026, 9, 15), 15);

  assert.equal(days.length, 15);
  assert.equal(days.at(-1)?.key, "2026-10-29");
});
