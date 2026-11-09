type QueueOrderEntry = {
  barberId?: number | null;
  status: string;
  startedAt?: string | null;
  scheduledAt?: string | null;
};

export function orderBarbersForLiveQueue<T extends { id: number }>(
  barbers: T[],
  entries: QueueOrderEntry[],
  nowMs = Date.now(),
): T[] {
  const orderByBarber = new Map<number, { group: number; time: number }>();

  for (const barber of barbers) {
    const barberEntries = entries.filter((entry) => entry.barberId === barber.id);
    const activeEntries = barberEntries
      .filter((entry) => entry.status === "in_progress")
      .sort((a, b) => {
        const aTime = a.startedAt ? new Date(a.startedAt).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.startedAt ? new Date(b.startedAt).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });

    if (activeEntries.length > 0) {
      const startedAt = activeEntries[0].startedAt
        ? new Date(activeEntries[0].startedAt).getTime()
        : Number.POSITIVE_INFINITY;
      orderByBarber.set(barber.id, { group: 0, time: startedAt });
      continue;
    }

    const nextScheduledAt = barberEntries
      .filter((entry) => entry.status === "waiting" && entry.scheduledAt)
      .map((entry) => new Date(entry.scheduledAt!).getTime())
      .filter((time) => Number.isFinite(time) && time >= nowMs)
      .sort((a, b) => a - b)[0];

    orderByBarber.set(
      barber.id,
      nextScheduledAt === undefined
        ? { group: 2, time: Number.POSITIVE_INFINITY }
        : { group: 1, time: nextScheduledAt },
    );
  }

  return barbers
    .map((barber, index) => ({ barber, index, order: orderByBarber.get(barber.id)! }))
    .sort((a, b) =>
      a.order.group - b.order.group ||
      a.order.time - b.order.time ||
      a.index - b.index,
    )
    .map(({ barber }) => barber);
}
