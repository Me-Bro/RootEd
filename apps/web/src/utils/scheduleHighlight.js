const DAY_TO_NUMBER = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };

export function isTodayColumn(day, now = new Date()) {
  return DAY_TO_NUMBER[day] === now.getDay();
}

export function isCurrentPeriodCell(day, entry, now = new Date()) {
  if (!entry || !entry.startTime || !entry.endTime || !isTodayColumn(day, now)) return false;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = entry.startTime.split(':').map(Number);
  const [endH, endM] = entry.endTime.split(':').map(Number);

  return minutesNow >= startH * 60 + startM && minutesNow < endH * 60 + endM;
}
