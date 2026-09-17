import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { TickerProvider } from '../../ticker/TickerProvider';
import { useCountdown, type UseCountdownOptions } from '../useCountdown';
import type { DeadlineInput } from '../toEpochMs';

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

const wrapper = ({ children }: { children: ReactNode }) => (
	<TickerProvider>{children}</TickerProvider>
);

type Props = { deadline: DeadlineInput; options?: UseCountdownOptions };

const renderCountdown = (initialProps: Props) => {
	let renders = 0;
	const hook = renderHook(
		({ deadline, options }: Props) => {
			renders += 1;
			return useCountdown(deadline, options);
		},
		{ wrapper, initialProps },
	);
	return { ...hook, renders: () => renders };
};

const advance = (ms: number) =>
	act(() => {
		jest.advanceTimersByTime(ms);
	});

describe('useCountdown', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(T0);
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it('is correct on the first render, before any tick', () => {
		const { result } = renderCountdown({ deadline: T0 + 10_000 });
		expect(result.current).toMatchObject({
			deadlineMs: T0 + 10_000,
			remainingMs: 10_000,
			secondsLeft: 10,
			minutesLeft: 1,
			isExpired: false,
			isActive: true,
		});
	});

	it('re-renders exactly once per second while counting down', () => {
		const { result, renders } = renderCountdown({ deadline: T0 + 5_000 });
		const before = renders();

		for (let second = 1; second <= 4; second += 1) {
			advance(1000);
			expect(result.current.secondsLeft).toBe(5 - second);
			expect(renders()).toBe(before + second);
		}
	});

	it('rounds partial seconds up like a wall clock', () => {
		const { result } = renderCountdown({ deadline: T0 + 2_400 });
		expect(result.current.secondsLeft).toBe(3);
		advance(1000);
		expect(result.current.secondsLeft).toBe(2);
		advance(1000);
		expect(result.current.secondsLeft).toBe(1);
		advance(1000);
		expect(result.current.secondsLeft).toBe(0);
		expect(result.current.isExpired).toBe(true);
	});

	it('expires, stops ticking and clamps at zero', () => {
		const { result } = renderCountdown({ deadline: T0 + 2_000 });
		advance(2000);
		expect(result.current).toMatchObject({
			secondsLeft: 0,
			isExpired: true,
			isActive: false,
		});
		expect(jest.getTimerCount()).toBe(0);

		advance(5000);
		expect(result.current.secondsLeft).toBe(0);
	});

	it('only re-renders on minute boundaries with minute granularity', () => {
		const { result, renders } = renderCountdown({
			deadline: T0 + 5 * 60_000,
			options: { granularity: 'minute' },
		});
		const before = renders();
		expect(result.current.minutesLeft).toBe(5);

		advance(59_000);
		expect(renders()).toBe(before);
		advance(1000);
		expect(renders()).toBe(before + 1);
		expect(result.current.minutesLeft).toBe(4);
	});

	it('fires each threshold once, including ones after the deadline', () => {
		const onThreshold = jest.fn();
		const { result } = renderCountdown({
			deadline: T0 + 5_000,
			options: { thresholds: [3, 0, -2], onThreshold },
		});

		advance(1000);
		expect(onThreshold).not.toHaveBeenCalled();
		advance(1000);
		expect(onThreshold).toHaveBeenCalledTimes(1);
		expect(onThreshold).toHaveBeenLastCalledWith(3, {
			deadlineMs: T0 + 5_000,
			remainingMs: 3_000,
			now: T0 + 2_000,
		});

		advance(3000);
		expect(onThreshold).toHaveBeenCalledTimes(2);
		expect(onThreshold).toHaveBeenLastCalledWith(0, expect.anything());
		expect(result.current.isExpired).toBe(true);
		expect(result.current.isActive).toBe(true);

		advance(2000);
		expect(onThreshold).toHaveBeenCalledTimes(3);
		expect(onThreshold).toHaveBeenLastCalledWith(-2, expect.anything());
		expect(result.current.isActive).toBe(false);
		expect(jest.getTimerCount()).toBe(0);

		advance(10_000);
		expect(onThreshold).toHaveBeenCalledTimes(3);
	});

	it('fires every crossed threshold after a long pause', () => {
		const onThreshold = jest.fn();
		renderCountdown({
			deadline: T0 + 5_000,
			options: { thresholds: [3, -2], onThreshold },
		});

		jest.setSystemTime(T0 + 20_000);
		advance(1000);
		expect(onThreshold.mock.calls.map(([t]) => t)).toEqual([3, -2]);
	});

	it('re-arms thresholds and resumes when the deadline is extended', () => {
		const onThreshold = jest.fn();
		const { result, rerender } = renderCountdown({
			deadline: T0 + 2_000,
			options: { thresholds: [0], onThreshold },
		});
		advance(2000);
		expect(onThreshold).toHaveBeenCalledTimes(1);
		expect(result.current.isActive).toBe(false);

		rerender({
			deadline: T0 + 6_000,
			options: { thresholds: [0], onThreshold },
		});
		expect(result.current).toMatchObject({
			secondsLeft: 4,
			isExpired: false,
			isActive: true,
		});

		advance(4000);
		expect(onThreshold).toHaveBeenCalledTimes(2);
		expect(result.current.isExpired).toBe(true);
	});

	it('measures an extended deadline against the current clock, not the frozen one', () => {
		const { result, rerender } = renderCountdown({ deadline: T0 + 1_000 });
		advance(1000);
		expect(result.current.isActive).toBe(false);

		advance(60_000);
		rerender({ deadline: T0 + 61_000 + 10_000 });
		expect(result.current.secondsLeft).toBe(10);
	});

	it('handles a missing deadline', () => {
		const { result } = renderCountdown({ deadline: null });
		expect(result.current).toMatchObject({
			deadlineMs: null,
			remainingMs: 0,
			secondsLeft: 0,
			isExpired: false,
			isActive: false,
		});
		expect(jest.getTimerCount()).toBe(0);
	});

	it('accepts ISO strings and Dates', () => {
		const iso = new Date(T0 + 30_000).toISOString();
		const { result, rerender } = renderCountdown({ deadline: iso });
		expect(result.current.secondsLeft).toBe(30);
		rerender({ deadline: new Date(T0 + 45_000) });
		expect(result.current.secondsLeft).toBe(45);
	});

	it('pauses while disabled and catches up when re-enabled', () => {
		const { result, rerender } = renderCountdown({
			deadline: T0 + 10_000,
			options: { enabled: false },
		});
		expect(result.current.isActive).toBe(false);
		advance(3000);
		expect(result.current.secondsLeft).toBe(10);

		rerender({ deadline: T0 + 10_000, options: { enabled: true } });
		expect(result.current.secondsLeft).toBe(7);
		expect(result.current.isActive).toBe(true);
	});
});
