import { useRef } from 'react';

/**
 * Returns the previous array reference while `isEqual` says the contents did
 * not change, so callers can use the array as an effect dependency without
 * re-running on every parent render.
 */
export function useStableArray<T>(
	value: readonly T[],
	isEqual: (a: readonly T[], b: readonly T[]) => boolean,
): readonly T[] {
	const ref = useRef(value);
	if (ref.current !== value && !isEqual(ref.current, value)) {
		ref.current = value;
	}
	return ref.current;
}
