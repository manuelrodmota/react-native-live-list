import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sameKeySet, type Key } from '../utils/keys';
import { useAppForeground } from '../utils/useAppForeground';
import { useDebouncedValue } from '../utils/useDebouncedValue';
import { useLatest } from '../utils/useLatest';
import { useStableArray } from '../utils/useStableArray';

export type Unsubscribe = () => void;
export type SubscriptionFailureReason = 'error' | 'open-timeout';
export type LiveSubscriptionStatus = 'idle' | 'connecting' | 'open' | 'error';

export interface SubscriptionHandle {
	/** Report that the transport is connected. Clears the open watchdog and any pending reconnect. */
	onOpen(): void;
	/** Report a transport failure. Schedules a rebuild after `reconnectDelayMs`. */
	onError(error?: unknown): void;
	/** Aborted when this attempt is torn down (keys changed, blurred, unmounted, rebuilt). */
	signal: AbortSignal;
}

/**
 * Opens a transport for `keys` and returns how to close it. May be async.
 * Call `handle.onOpen()` once connected and `handle.onError()` on failure.
 */
export type Subscriber<K extends Key> = (
	keys: readonly K[],
	handle: SubscriptionHandle,
) => Unsubscribe | void | Promise<Unsubscribe | void>;

export interface SubscriptionErrorInfo<K extends Key> {
	reason: SubscriptionFailureReason;
	/** Failures since the last successful open, including this one. */
	consecutiveErrors: number;
	/** Delay before the scheduled rebuild. */
	retryInMs: number;
	keys: readonly K[];
}

export interface UseLiveSubscriptionOptions<K extends Key> {
	/** Keys to stay subscribed to, typically the viewable rows. */
	keys: readonly K[];
	subscribe: Subscriber<K>;
	/** Hold a subscription only while true, e.g. while the screen is focused. Defaults to true. */
	enabled?: boolean;
	/** Wait for the key set to settle before rebuilding the transport. Defaults to 300. */
	debounceMs?: number;
	/** Rebuild when the app returns to the foreground, since suspended sockets die silently. Defaults to true. */
	resubscribeOnForeground?: boolean;
	/** Rebuild immediately if `onOpen` is not called within this time. 0 disables. Defaults to 15000. */
	openTimeoutMs?: number;
	/** Delay before rebuilding after `onError`. Defaults to 5000. */
	reconnectDelayMs?: number;
	/** Upper bound for exponential backoff. Defaults to `reconnectDelayMs` (no backoff). */
	maxReconnectDelayMs?: number;
	onOpen?: (keys: readonly K[]) => void;
	onError?: (error: unknown, info: SubscriptionErrorInfo<K>) => void;
}

export interface LiveSubscription<K extends Key> {
	status: LiveSubscriptionStatus;
	/** Failures since the last successful open. */
	consecutiveErrors: number;
	/** The debounced key set the current transport was opened for. */
	keys: readonly K[];
	/** Tear down and reopen the transport, e.g. after refreshing credentials. */
	reconnect(): void;
}

export class OpenTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(
			`react-native-live-list: subscription did not open within ${timeoutMs}ms`,
		);
		this.name = 'OpenTimeoutError';
	}
}

interface ConnectionState {
	status: LiveSubscriptionStatus;
	consecutiveErrors: number;
}

const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as PromiseLike<T>).then === 'function';

const backoffDelay = (baseMs: number, maxMs: number, attempt: number) =>
	Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));

/**
 * Keeps one transport open for the current key set: rebuilds it when the set
 * changes (debounced), when the app returns to the foreground, when the
 * transport reports an error or never opens, and tears it down when disabled.
 */
export function useLiveSubscription<K extends Key>(
	options: UseLiveSubscriptionOptions<K>,
): LiveSubscription<K> {
	const {
		keys,
		subscribe,
		enabled = true,
		debounceMs = 300,
		resubscribeOnForeground = true,
		openTimeoutMs = 15_000,
		reconnectDelayMs = 5_000,
		maxReconnectDelayMs = reconnectDelayMs,
		onOpen,
		onError,
	} = options;

	const stableKeys = useStableArray(keys, sameKeySet);
	const activeKeys = useDebouncedValue(stableKeys, debounceMs);

	const [epoch, setEpoch] = useState(0);
	const reconnect = useCallback(() => setEpoch((value) => value + 1), []);
	useAppForeground(reconnect, enabled && resubscribeOnForeground);

	const subscribeRef = useLatest(subscribe);
	const onOpenRef = useLatest(onOpen);
	const onErrorRef = useLatest(onError);
	const consecutiveErrorsRef = useRef(0);
	const [connection, setConnection] = useState<ConnectionState>({
		status: 'idle',
		consecutiveErrors: 0,
	});

	const shouldSubscribe = enabled && activeKeys.length > 0;

	useEffect(() => {
		if (!shouldSubscribe) {
			setConnection((previous) =>
				previous.status === 'idle' ? previous : { ...previous, status: 'idle' },
			);
			return;
		}

		let cancelled = false;
		let unsubscribe: Unsubscribe | void;
		let openTimer: ReturnType<typeof setTimeout> | null = null;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		const controller = new AbortController();
		const attemptKeys = activeKeys;

		const clearOpenTimer = () => {
			if (openTimer !== null) {
				clearTimeout(openTimer);
				openTimer = null;
			}
		};
		const clearReconnectTimer = () => {
			if (reconnectTimer !== null) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
		};

		const fail = (reason: SubscriptionFailureReason, error: unknown) => {
			if (cancelled) return;
			clearOpenTimer();
			const consecutiveErrors = ++consecutiveErrorsRef.current;
			const retryInMs =
				reason === 'open-timeout'
					? 0
					: backoffDelay(
							reconnectDelayMs,
							maxReconnectDelayMs,
							consecutiveErrors,
						);
			setConnection({ status: 'error', consecutiveErrors });
			onErrorRef.current?.(error, {
				reason,
				consecutiveErrors,
				retryInMs,
				keys: attemptKeys,
			});
			if (reconnectTimer === null) {
				reconnectTimer = setTimeout(() => {
					reconnectTimer = null;
					if (!cancelled) setEpoch((value) => value + 1);
				}, retryInMs);
			}
		};

		const handle: SubscriptionHandle = {
			signal: controller.signal,
			onOpen: () => {
				if (cancelled) return;
				consecutiveErrorsRef.current = 0;
				clearOpenTimer();
				clearReconnectTimer();
				setConnection({ status: 'open', consecutiveErrors: 0 });
				onOpenRef.current?.(attemptKeys);
			},
			onError: (error) => fail('error', error),
		};

		setConnection((previous) => ({ ...previous, status: 'connecting' }));
		if (openTimeoutMs > 0) {
			openTimer = setTimeout(() => {
				openTimer = null;
				fail('open-timeout', new OpenTimeoutError(openTimeoutMs));
			}, openTimeoutMs);
		}

		const settle = (result: Unsubscribe | void) => {
			if (cancelled) {
				result?.();
				return;
			}
			unsubscribe = result;
		};

		try {
			const result = subscribeRef.current(attemptKeys, handle);
			if (isPromiseLike<Unsubscribe | void>(result)) {
				result.then(settle, (error) => fail('error', error));
			} else {
				settle(result);
			}
		} catch (error) {
			fail('error', error);
		}

		return () => {
			cancelled = true;
			clearOpenTimer();
			clearReconnectTimer();
			controller.abort();
			unsubscribe?.();
			unsubscribe = undefined;
		};
	}, [
		shouldSubscribe,
		activeKeys,
		epoch,
		openTimeoutMs,
		reconnectDelayMs,
		maxReconnectDelayMs,
		subscribeRef,
		onOpenRef,
		onErrorRef,
	]);

	return useMemo<LiveSubscription<K>>(
		() => ({
			status: connection.status,
			consecutiveErrors: connection.consecutiveErrors,
			keys: activeKeys,
			reconnect,
		}),
		[connection, activeKeys, reconnect],
	);
}
