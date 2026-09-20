export type Key = string | number;

/**
 * Order-insensitive equality for two key lists. Falls back to positional
 * comparison when either list contains duplicates.
 */
export function sameKeySet<K>(a: readonly K[], b: readonly K[]): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	if (a.length === 0) return true;
	const setA = new Set(a);
	const setB = new Set(b);
	if (setA.size !== a.length || setB.size !== b.length) {
		return a.every((key, index) => key === b[index]);
	}
	for (const key of setB) {
		if (!setA.has(key)) return false;
	}
	return true;
}
