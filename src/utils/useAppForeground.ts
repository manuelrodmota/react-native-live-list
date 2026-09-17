import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useLatest } from './useLatest';

const isBackgrounded = (state: AppStateStatus) =>
	state === 'background' || state === 'inactive';

/**
 * Calls `onForeground` each time the app returns to `active` from
 * `background` or `inactive`.
 */
export function useAppForeground(
	onForeground: () => void,
	enabled: boolean = true,
): void {
	const callbackRef = useLatest(onForeground);

	useEffect(() => {
		if (!enabled) return;
		let previous = AppState.currentState;
		const subscription = AppState.addEventListener('change', (next) => {
			if (next === 'active' && isBackgrounded(previous)) {
				callbackRef.current();
			}
			previous = next;
		});
		return () => subscription.remove();
	}, [enabled, callbackRef]);
}
