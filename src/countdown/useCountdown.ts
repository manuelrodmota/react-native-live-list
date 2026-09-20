import { useEffect, useMemo, useRef, useState } from 'react';
import { useTick, useTicker } from '../ticker/TickerProvider';
import { useLatest } from '../utils/useLatest';
import { toEpochMs, type DeadlineInput } from './toEpochMs';

export type CountdownGranularity = 'second' | 'minute';

export interface ThresholdContext {
	deadlineMs: number;
	/** Remaining ms at the tick that crossed the threshold (negative after the deadline). */
	remainingMs: number;
	now: number;
}

export interface UseCountdownOptions {
	/**
	 * Re-render only when this unit of the remaining time changes. Defaults to
	 * 'second'. Use 'minute' for rows that display no seconds.
	 */
	granularity?: CountdownGranularity;
	/**
	 * Seconds relative to the deadline at which `onThreshold` fires once. Zero
	 * is the deadline itself, positive values are before it, negative values
	 * after it (e.g. `[-3, -8]` to re-check an item the server never closed).
	 * They fire again if the deadline moves.
	 */
	thresholds?: readonly number[];
	onThreshold?: (thresholdSeconds: number, context: ThresholdContext) => void;
	/** Pause ticking without unmounting. Defaults to true. */
	enabled?: boolean;
}

export interface Countdown {
	deadlineMs: number | null;
	/** Remaining ms as of the last update; negative after the deadline. */
	remainingMs: number;
	/** Whole seconds left, rounded up and clamped at 0. */
	secondsLeft: number;
	/** Whole minutes left, rounded up and clamped at 0. */
	minutesLeft: number;
	isExpired: boolean;
	/** Whether this countdown is currently subscribed to the ticker. */
	isActive: boolean;
}

const NO_THRESHOLDS: readonly number[] = [];
const UNIT_MS: Record<CountdownGranularity, number> = {
	second: 1000,
	minute: 60_000,
};

const bucketOf = (remainingMs: number, granularity: CountdownGranularity) =>
	Math.ceil(remainingMs / UNIT_MS[granularity]);

/** Remaining ms at or below which the deadline and every threshold have passed. */
const settleAtMs = (thresholds: readonly number[]) => {
	let settleAt = 0;
	for (const threshold of thresholds) {
		settleAt = Math.min(settleAt, threshold * 1000);
	}
	return settleAt;
};

/**
 * Counts down to `deadline` on the shared ticker. Re-renders only when the
 * displayed unit changes, stops ticking once the deadline and every threshold
 * have passed, and resumes if the deadline is moved.
 */
export function useCountdown(
	deadline: DeadlineInput,
	options: UseCountdownOptions = {},
): Countdown {
	const {
		granularity = 'second',
		thresholds = NO_THRESHOLDS,
		onThreshold,
		enabled = true,
	} = options;

	const ticker = useTicker();
	const deadlineMs = useMemo(() => toEpochMs(deadline), [deadline]);
	const onThresholdRef = useLatest(onThreshold);
	const thresholdsRef = useLatest(thresholds);

	const [nowMs, setNowMs] = useState(() => ticker.now());
	const remainingMs = deadlineMs === null ? 0 : deadlineMs - nowMs;

	const bucketRef = useRef(bucketOf(remainingMs, granularity));
	const firedRef = useRef(new Set<number>());
	const armedForRef = useRef(deadlineMs);

	const isActive =
		enabled && deadlineMs !== null && remainingMs > settleAtMs(thresholds);

	// Re-seed the clock when (re)activating so an extended deadline is not
	// measured against a `now` frozen while the countdown was settled.
	useEffect(() => {
		if (!isActive || deadlineMs === null) return;
		const now = ticker.now();
		setNowMs((previous) =>
			bucketOf(deadlineMs - now, granularity) ===
			bucketOf(deadlineMs - previous, granularity)
				? previous
				: now,
		);
	}, [isActive, deadlineMs, granularity, ticker]);

	useTick(
		(now) => {
			if (deadlineMs === null) return;
			if (armedForRef.current !== deadlineMs) {
				armedForRef.current = deadlineMs;
				firedRef.current.clear();
			}

			const remaining = deadlineMs - now;
			const bucket = bucketOf(remaining, granularity);
			if (
				bucket !== bucketRef.current ||
				remaining <= settleAtMs(thresholdsRef.current)
			) {
				bucketRef.current = bucket;
				setNowMs(now);
			}

			for (const threshold of thresholdsRef.current) {
				if (firedRef.current.has(threshold)) continue;
				if (remaining <= threshold * 1000) {
					firedRef.current.add(threshold);
					onThresholdRef.current?.(threshold, {
						deadlineMs,
						remainingMs: remaining,
						now,
					});
				}
			}
		},
		{ enabled: isActive },
	);

	return useMemo<Countdown>(
		() => ({
			deadlineMs,
			remainingMs,
			secondsLeft:
				deadlineMs === null ? 0 : Math.max(0, Math.ceil(remainingMs / 1000)),
			minutesLeft:
				deadlineMs === null ? 0 : Math.max(0, Math.ceil(remainingMs / 60_000)),
			isExpired: deadlineMs !== null && remainingMs <= 0,
			isActive,
		}),
		[deadlineMs, remainingMs, isActive],
	);
}
