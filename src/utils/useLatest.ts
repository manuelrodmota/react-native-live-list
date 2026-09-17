import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * A ref that always holds the latest value. Lets long-lived callbacks (timers,
 * list callbacks, subscriptions) read fresh props without re-registering.
 */
export function useLatest<T>(value: T): RefObject<T> {
	const ref = useRef(value);
	useLayoutEffect(() => {
		ref.current = value;
	});
	return ref;
}
