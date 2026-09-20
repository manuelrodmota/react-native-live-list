import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	type ReactNode,
} from 'react';
import { useLatest } from '../utils/useLatest';
import { createAlignedScheduler } from './scheduler';

export type TickListener = (now: number) => void;

export interface Ticker {
	/** Milliseconds between ticks. */
	readonly intervalMs: number;
	/** Current time in epoch ms, including `clockOffsetMs`. */
	now(): number;
	/**
	 * Registers a listener and returns its unsubscribe function. The single
	 * shared interval starts with the first listener and stops with the last.
	 * A listener that throws does not stop the interval or skip the others;
	 * the error is rethrown once the tick has been delivered.
	 */
	subscribe(listener: TickListener): () => void;
	/** Number of registered listeners. */
	listenerCount(): number;
}

export interface TickerProviderProps {
	/** Tick period in ms. Defaults to 1000. */
	intervalMs?: number;
	/**
	 * Server time minus device time, in ms. Applied to `now()` so countdowns
	 * agree with the server even when the device clock is off.
	 */
	clockOffsetMs?: number;
	children?: ReactNode;
}

interface InternalTicker extends Ticker {
	stop(): void;
}

const TickerContext = createContext<InternalTicker | null>(null);
TickerContext.displayName = 'TickerContext';

export function TickerProvider({
	intervalMs = 1000,
	clockOffsetMs = 0,
	children,
}: TickerProviderProps) {
	const offsetRef = useLatest(clockOffsetMs);

	const ticker = useMemo<InternalTicker>(() => {
		const listeners = new Set<TickListener>();
		const now = () => Date.now() + offsetRef.current;
		const scheduler = createAlignedScheduler(intervalMs, now, (tickNow) => {
			const errors: unknown[] = [];
			for (const listener of Array.from(listeners)) {
				if (!listeners.has(listener)) continue;
				try {
					listener(tickNow);
				} catch (error) {
					errors.push(error);
				}
			}
			if (errors.length > 0) throw errors[0];
		});

		return {
			intervalMs,
			now,
			subscribe(listener) {
				listeners.add(listener);
				if (listeners.size === 1) scheduler.start();
				return () => {
					if (!listeners.delete(listener)) return;
					if (listeners.size === 0) scheduler.stop();
				};
			},
			listenerCount: () => listeners.size,
			stop: () => scheduler.stop(),
		};
	}, [intervalMs, offsetRef]);

	useEffect(() => () => ticker.stop(), [ticker]);

	return (
		<TickerContext.Provider value={ticker}>{children}</TickerContext.Provider>
	);
}

export function useTicker(): Ticker {
	const ticker = useContext(TickerContext);
	if (ticker === null) {
		throw new Error(
			'react-native-live-list: useTicker, useTick and useCountdown must be rendered inside a <TickerProvider>.',
		);
	}
	return ticker;
}

export interface UseTickOptions {
	/** Pause the subscription without unmounting. Defaults to true. */
	enabled?: boolean;
}

/**
 * Runs `onTick(now)` on every shared tick. The latest `onTick` is always
 * called; changing its identity does not re-register.
 */
export function useTick(
	onTick: TickListener,
	{ enabled = true }: UseTickOptions = {},
): void {
	const ticker = useTicker();
	const onTickRef = useLatest(onTick);

	useEffect(() => {
		if (!enabled) return;
		return ticker.subscribe((now) => onTickRef.current(now));
	}, [ticker, enabled, onTickRef]);
}
