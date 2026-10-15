export type RescheduleDay = {
  key: string;
  weekday: string;
  dayNum: string;
};

export function buildRescheduleDays(today: Date, maxBookingDays: number): RescheduleDay[] {
  const dayCount = Number.isFinite(maxBookingDays)
    ? Math.max(1, Math.floor(maxBookingDays))
    : 30;

  return Array.from({ length: dayCount }, (_, offset) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const year = day.getFullYear();
    const month = (day.getMonth() + 1).toString().padStart(2, "0");
    const dayNum = day.getDate().toString().padStart(2, "0");

    return {
      key: `${year}-${month}-${dayNum}`,
      weekday: ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][day.getDay()],
      dayNum,
    };
  });
}
