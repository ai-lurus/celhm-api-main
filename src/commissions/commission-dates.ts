/**
 * Date helpers for commissions only. Rules and Preview think in calendar days of
 * Organization.timezone; sales keep their exact timestamp and never use these.
 * (Organization.timezone is not read anywhere else in the codebase; that is
 * logged as tech debt, not refactored here.)
 */

export const DEFAULT_TIMEZONE = 'America/Mexico_City';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateOnly {
  year: number;
  month: number;
  day: number;
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** "YYYY-MM-DD" that is a real calendar date, otherwise null. */
export function parseDateOnly(input: string): DateOnly | null {
  const match = DATE_ONLY.exec(input);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/** Offset of a zone from UTC at a given instant, in ms (positive east of UTC). */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const value = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wallAsUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
  return wallAsUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant at which the wall clock of `timeZone` reads the given local time. */
function zonedWallTimeToUtc(date: DateOnly, hms: [number, number, number, number], timeZone: string): Date {
  const wallAsUtc = Date.UTC(date.year, date.month - 1, date.day, ...hms);
  // Two passes so a DST change between the guess and the answer is handled.
  const firstGuess = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  return new Date(wallAsUtc - zoneOffsetMs(firstGuess, timeZone));
}

export function startOfDayInTimezone(dateOnly: string, timeZone: string): Date {
  const date = parseDateOnly(dateOnly);
  if (!date) throw new RangeError(`Invalid date: ${dateOnly}`);
  return zonedWallTimeToUtc(date, [0, 0, 0, 0], timeZone);
}

export function endOfDayInTimezone(dateOnly: string, timeZone: string): Date {
  const date = parseDateOnly(dateOnly);
  if (!date) throw new RangeError(`Invalid date: ${dateOnly}`);
  return zonedWallTimeToUtc(date, [23, 59, 59, 999], timeZone);
}

/** The calendar day ("YYYY-MM-DD") that an instant falls on in `timeZone`. */
export function dateKeyInTimezone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Preview input to an instant. A date-only value means "the end of that day in
 * the org timezone", so rules that started earlier the same day (including legacy
 * ones with an intraday validFrom) are in force. A full timestamp is kept exact.
 * Returns null when the input is not a date.
 */
export function resolvePreviewInstant(input: string | undefined, timeZone: string, now: Date = new Date()): Date | null {
  if (!input) return now;
  if (DATE_ONLY.test(input)) {
    return parseDateOnly(input) ? endOfDayInTimezone(input, timeZone) : null;
  }
  const exact = new Date(input);
  return Number.isNaN(exact.getTime()) ? null : exact;
}
