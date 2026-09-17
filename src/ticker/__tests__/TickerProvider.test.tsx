import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { TickerProvider, useTick, useTicker } from '../TickerProvider';

const wrapper = ({ children }: { children: ReactNode }) => (
	<TickerProvider>{children}</TickerProvider>
);

describe('TickerProvider', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(10_000);
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it('shares one interval between every subscriber', () => {
		const first = jest.fn();
		const second = jest.fn();
		renderHook(
			() => {
				useTick(first);
				useTick(second);
				return useTicker();
			},
			{ wrapper },
		);

		expect(jest.getTimerCount()).toBe(1);
		act(() => {
			jest.advanceTimersByTime(2000);
		});
		expect(first.mock.calls).toEqual([[11_000], [12_000]]);
		expect(second.mock.calls).toEqual([[11_000], [12_000]]);
		expect(jest.getTimerCount()).toBe(1);
	});

	it('starts with the first listener and stops with the last', () => {
		const { result, unmount } = renderHook(() => useTicker(), { wrapper });
		expect(jest.getTimerCount()).toBe(0);

		const unsubscribe = result.current.subscribe(() => {});
		expect(result.current.listenerCount()).toBe(1);
		expect(jest.getTimerCount()).toBe(1);

		unsubscribe();
		unsubscribe();
		expect(result.current.listenerCount()).toBe(0);
		expect(jest.getTimerCount()).toBe(0);

		result.current.subscribe(() => {});
		unmount();
		expect(jest.getTimerCount()).toBe(0);
	});

	it('does not subscribe while disabled', () => {
		const onTick = jest.fn();
		const { rerender } = renderHook(
			({ enabled }: { enabled: boolean }) => useTick(onTick, { enabled }),
			{ wrapper, initialProps: { enabled: false } },
		);
		expect(jest.getTimerCount()).toBe(0);

		rerender({ enabled: true });
		expect(jest.getTimerCount()).toBe(1);
		act(() => {
			jest.advanceTimersByTime(1000);
		});
		expect(onTick).toHaveBeenCalledWith(11_000);

		rerender({ enabled: false });
		expect(jest.getTimerCount()).toBe(0);
	});

	it('always calls the latest callback without re-registering', () => {
		const first = jest.fn();
		const second = jest.fn();
		const { result, rerender } = renderHook(
			({ onTick }: { onTick: (now: number) => void }) => {
				useTick(onTick);
				return useTicker();
			},
			{ wrapper, initialProps: { onTick: first } },
		);
		const subscribeSpy = jest.spyOn(result.current, 'subscribe');

		rerender({ onTick: second });
		act(() => {
			jest.advanceTimersByTime(1000);
		});
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledWith(11_000);
		expect(subscribeSpy).not.toHaveBeenCalled();
	});

	it('skips a listener removed earlier in the same tick', () => {
		const { result } = renderHook(() => useTicker(), { wrapper });
		const second = jest.fn();
		let unsubscribeSecond = () => {};
		result.current.subscribe(() => unsubscribeSecond());
		unsubscribeSecond = result.current.subscribe(second);

		act(() => {
			jest.advanceTimersByTime(1000);
		});
		expect(second).not.toHaveBeenCalled();
	});

	it('applies clockOffsetMs to now() and tick timestamps', () => {
		const onTick = jest.fn();
		const { result } = renderHook(
			() => {
				useTick(onTick);
				return useTicker();
			},
			{
				wrapper: ({ children }) => (
					<TickerProvider clockOffsetMs={5_000}>{children}</TickerProvider>
				),
			},
		);
		expect(result.current.now()).toBe(15_000);
		act(() => {
			jest.advanceTimersByTime(1000);
		});
		expect(onTick).toHaveBeenCalledWith(16_000);
	});

	it('throws a helpful error without a provider', () => {
		const error = jest.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => renderHook(() => useTick(() => {}))).toThrow(
			/inside a <TickerProvider>/,
		);
		error.mockRestore();
	});
});
