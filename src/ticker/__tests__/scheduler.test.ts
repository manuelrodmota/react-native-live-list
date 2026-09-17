import { createAlignedScheduler } from '../scheduler';

describe('createAlignedScheduler', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(10_250);
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it('fires on whole-interval boundaries of the clock', () => {
		const ticks: number[] = [];
		const scheduler = createAlignedScheduler(1000, Date.now, (now) =>
			ticks.push(now),
		);
		scheduler.start();

		jest.advanceTimersByTime(749);
		expect(ticks).toEqual([]);
		jest.advanceTimersByTime(1);
		expect(ticks).toEqual([11_000]);
		jest.advanceTimersByTime(2000);
		expect(ticks).toEqual([11_000, 12_000, 13_000]);
	});

	it('re-aligns after the runtime was suspended', () => {
		const ticks: number[] = [];
		const scheduler = createAlignedScheduler(1000, Date.now, (now) =>
			ticks.push(now),
		);
		scheduler.start();
		jest.advanceTimersByTime(750);
		expect(ticks).toEqual([11_000]);

		jest.setSystemTime(71_300);
		jest.advanceTimersByTime(1000);
		expect(ticks).toEqual([11_000, 72_300]);
		jest.advanceTimersByTime(699);
		expect(ticks).toHaveLength(2);
		jest.advanceTimersByTime(1);
		expect(ticks).toEqual([11_000, 72_300, 73_000]);
	});

	it('stops, restarts and reports its state', () => {
		const onTick = jest.fn();
		const scheduler = createAlignedScheduler(1000, Date.now, onTick);
		expect(scheduler.isRunning()).toBe(false);

		scheduler.start();
		expect(scheduler.isRunning()).toBe(true);
		scheduler.stop();
		expect(scheduler.isRunning()).toBe(false);
		expect(jest.getTimerCount()).toBe(0);
		jest.advanceTimersByTime(5000);
		expect(onTick).not.toHaveBeenCalled();

		scheduler.start();
		scheduler.start();
		jest.advanceTimersByTime(1000);
		expect(onTick).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(1);
	});

	it('honours stop() called from inside onTick', () => {
		const scheduler = createAlignedScheduler(1000, Date.now, () =>
			scheduler.stop(),
		);
		scheduler.start();
		jest.advanceTimersByTime(1000);
		expect(scheduler.isRunning()).toBe(false);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('uses the injected clock for alignment', () => {
		const ticks: number[] = [];
		const offset = 400;
		const scheduler = createAlignedScheduler(
			1000,
			() => Date.now() + offset,
			(now) => ticks.push(now),
		);
		scheduler.start();
		jest.advanceTimersByTime(350);
		expect(ticks).toEqual([11_000]);
	});

	it('rejects a non-positive interval', () => {
		expect(() => createAlignedScheduler(0, Date.now, () => {})).toThrow(
			RangeError,
		);
		expect(() => createAlignedScheduler(NaN, Date.now, () => {})).toThrow(
			RangeError,
		);
	});
});
