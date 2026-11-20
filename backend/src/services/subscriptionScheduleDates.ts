import { DeliveryTimePreference } from "@prisma/client";

const deliveryTimes: Record<DeliveryTimePreference, string> = {
  MORNING: "09:00",
  AFTERNOON: "13:00",
  EVENING: "17:00",
};

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateOnly(date: Date): Date {
  return new Date(`${dateKey(date)}T00:00:00.000Z`);
}

export function addCalendarDays(date: Date, days: number): Date {
  const result = dateOnly(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function zonedDateTime(
  date: Date,
  time: string,
  timeZone: string
): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const dateKeyValue = dateKey(date);
  const [year, month, day] = dateKeyValue.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(targetAsUtc));
  const values = new Map(parts.map((part) => [part.type, Number(part.value)]));
  const observedAsUtc = Date.UTC(
    values.get("year")!,
    values.get("month")! - 1,
    values.get("day")!,
    values.get("hour")!,
    values.get("minute")!
  );
  return new Date(targetAsUtc - (observedAsUtc - targetAsUtc));
}

export function scheduledDateTime(
  date: Date,
  preference: DeliveryTimePreference,
  timeZone: string
): Date {
  return zonedDateTime(date, deliveryTimes[preference], timeZone);
}

export function nextScheduleDate(
  startDate: Date,
  intervalDays: number,
  preference: DeliveryTimePreference,
  now: Date,
  timeZone: string
): Date {
  let date = dateOnly(startDate);
  while (scheduledDateTime(date, preference, timeZone) < now) {
    date = addCalendarDays(date, intervalDays);
  }
  return date;
}

export function scheduleWindowEndDate(
  now: Date,
  windowDays: number,
  timeZone: string
): Date {
  return addCalendarDays(dateOnly(new Date(`${localDateKey(now, timeZone)}T00:00:00.000Z`)), windowDays);
}

export function startOfLocalDate(dateKeyValue: string, timeZone: string): Date {
  return zonedDateTime(
    new Date(`${dateKeyValue}T00:00:00.000Z`),
    "00:00",
    timeZone
  );
}
