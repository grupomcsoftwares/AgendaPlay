import assert from "node:assert/strict";
import test from "node:test";
import { orderBarbersForLiveQueue } from "./barberQueueOrdering.ts";

const now = new Date("2026-11-09T10:00:00.000Z").getTime();

test("active barbers appear by service start time before idle barbers", () => {
  const barbers = [
    { id: 1, name: "Vilson" },
    { id: 2, name: "Livre" },
    { id: 3, name: "Carlos" },
    { id: 4, name: "Eduardo" },
  ];
  const entries = [
    { barberId: 1, status: "in_progress", startedAt: "2026-11-09T10:18:00.000Z" },
    { barberId: 3, status: "in_progress", startedAt: "2026-11-09T10:00:00.000Z" },
    { barberId: 4, status: "in_progress", startedAt: "2026-11-09T10:05:00.000Z" },
  ];

  assert.deepEqual(
    orderBarbersForLiveQueue(barbers, entries, now).map((barber) => barber.name),
    ["Carlos", "Eduardo", "Vilson", "Livre"],
  );
});

test("idle barbers with nearer future appointments come before those without appointments", () => {
  const barbers = [{ id: 1, name: "Mais tarde" }, { id: 2, name: "Em breve" }, { id: 3, name: "Sem horário" }];
  const entries = [
    { barberId: 1, status: "waiting", scheduledAt: "2026-11-09T13:00:00.000Z" },
    { barberId: 2, status: "waiting", scheduledAt: "2026-11-09T10:30:00.000Z" },
  ];

  assert.deepEqual(
    orderBarbersForLiveQueue(barbers, entries, now).map((barber) => barber.name),
    ["Em breve", "Mais tarde", "Sem horário"],
  );
});
