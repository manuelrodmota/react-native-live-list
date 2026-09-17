import { sameKeySet } from '../keys';

describe('sameKeySet', () => {
	it('ignores order', () => {
		expect(sameKeySet([1, 2, 3], [3, 1, 2])).toBe(true);
		expect(sameKeySet(['a', 'b'], ['b', 'a'])).toBe(true);
	});

	it('detects differing contents', () => {
		expect(sameKeySet([1, 2, 3], [1, 2, 4])).toBe(false);
		expect(sameKeySet([1, 2], [1, 2, 3])).toBe(false);
		expect(sameKeySet([1, 2, 3], [1, 1, 2])).toBe(false);
	});

	it('handles empty lists and duplicates', () => {
		expect(sameKeySet([], [])).toBe(true);
		expect(sameKeySet([1, 1, 2], [1, 1, 2])).toBe(true);
		expect(sameKeySet([1, 1, 2], [1, 2, 2])).toBe(false);
	});
});
