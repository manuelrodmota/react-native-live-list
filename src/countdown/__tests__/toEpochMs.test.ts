import { toEpochMs } from '../toEpochMs';

describe('toEpochMs', () => {
	it('accepts epoch ms, ISO strings and Dates', () => {
		expect(toEpochMs(1_700_000_000_000)).toBe(1_700_000_000_000);
		expect(toEpochMs('2026-01-01T00:00:00.000Z')).toBe(
			Date.UTC(2026, 0, 1, 0, 0, 0),
		);
		expect(toEpochMs(new Date(Date.UTC(2026, 0, 1)))).toBe(
			Date.UTC(2026, 0, 1),
		);
	});

	it('returns null for missing or invalid input', () => {
		expect(toEpochMs(null)).toBeNull();
		expect(toEpochMs(undefined)).toBeNull();
		expect(toEpochMs('not a date')).toBeNull();
		expect(toEpochMs(NaN)).toBeNull();
		expect(toEpochMs(Infinity)).toBeNull();
		expect(toEpochMs(new Date('invalid'))).toBeNull();
	});
});
