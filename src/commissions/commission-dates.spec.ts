import {
  dateKeyInTimezone,
  endOfDayInTimezone,
  isValidTimezone,
  parseDateOnly,
  resolvePreviewInstant,
  startOfDayInTimezone,
} from './commission-dates';

const MX = 'America/Mexico_City'; // UTC-6 all year since 2022
const NY = 'America/New_York';

describe('commission-dates (scoped to commissions)', () => {
  describe('parseDateOnly', () => {
    it('accepts real calendar dates only', () => {
      expect(parseDateOnly('2026-09-21')).toEqual({ year: 2026, month: 9, day: 21 });
      expect(parseDateOnly('2026-02-31')).toBeNull();
      expect(parseDateOnly('2026-9-21')).toBeNull();
      expect(parseDateOnly('2026-09-21T16:00:00Z')).toBeNull();
    });
  });

  describe('start and end of day', () => {
    it('Mexico City: the day runs 06:00Z to 05:59:59.999Z next day', () => {
      expect(startOfDayInTimezone('2026-09-21', MX).toISOString()).toBe('2026-09-21T06:00:00.000Z');
      expect(endOfDayInTimezone('2026-09-21', MX).toISOString()).toBe('2026-09-22T05:59:59.999Z');
    });

    it('New York on spring-forward day (2026-03-08) is 23 hours long', () => {
      expect(startOfDayInTimezone('2026-03-08', NY).toISOString()).toBe('2026-03-08T05:00:00.000Z'); // EST
      expect(endOfDayInTimezone('2026-03-08', NY).toISOString()).toBe('2026-03-09T03:59:59.999Z'); // EDT
    });

    it('New York on fall-back day (2026-11-01) is 25 hours long', () => {
      expect(startOfDayInTimezone('2026-11-01', NY).toISOString()).toBe('2026-11-01T04:00:00.000Z'); // EDT
      expect(endOfDayInTimezone('2026-11-01', NY).toISOString()).toBe('2026-11-02T04:59:59.999Z'); // EST
    });
  });

  describe('dateKeyInTimezone', () => {
    it('names the local calendar day of an instant', () => {
      expect(dateKeyInTimezone(new Date('2026-09-21T06:00:00.000Z'), MX)).toBe('2026-09-21');
      expect(dateKeyInTimezone(new Date('2026-09-21T05:59:59.999Z'), MX)).toBe('2026-09-20');
      expect(dateKeyInTimezone(new Date('2026-09-22T03:00:00.000Z'), MX)).toBe('2026-09-21');
    });
  });

  describe('isValidTimezone', () => {
    it('rejects unknown zone names', () => {
      expect(isValidTimezone(MX)).toBe(true);
      expect(isValidTimezone('Mars/Olympus')).toBe(false);
    });
  });

  describe('resolvePreviewInstant', () => {
    const now = new Date('2026-09-21T20:00:00.000Z');

    it('evaluates a date-only input at the END of that day in the org timezone, not at UTC midnight', () => {
      const instant = resolvePreviewInstant('2026-09-21', MX, now);
      expect(instant?.toISOString()).toBe('2026-09-22T05:59:59.999Z');
      // A rule that started at 16:00Z (10:00 local) that same day is already in force by then.
      expect(instant!.getTime()).toBeGreaterThan(new Date('2026-09-21T16:00:00.000Z').getTime());
    });

    it('keeps a full timestamp as the exact instant', () => {
      expect(resolvePreviewInstant('2026-09-21T16:00:00.000Z', MX, now)?.toISOString()).toBe('2026-09-21T16:00:00.000Z');
    });

    it('uses now when there is no input', () => {
      expect(resolvePreviewInstant(undefined, MX, now)).toEqual(now);
      expect(resolvePreviewInstant('', MX, now)).toEqual(now);
    });

    it('returns null for input that is not a date', () => {
      expect(resolvePreviewInstant('mañana', MX, now)).toBeNull();
      expect(resolvePreviewInstant('2026-02-31', MX, now)).toBeNull();
    });
  });
});
