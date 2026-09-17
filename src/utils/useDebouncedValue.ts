import { useEffect, useState } from 'react';

/**
 * Trails `value` by `delayMs`. The initial value is applied immediately; a
 * delay of 0 or less applies changes on the next render.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		if (Object.is(value, debounced)) return;
		if (delayMs <= 0) {
			setDebounced(value);
			return;
		}
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, debounced, delayMs]);

	return debounced;
}
