import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import {
	OpenTimeoutError,
	useLiveSubscription,
	type SubscriptionHandle,
	type UseLiveSubscriptionOptions,
} from '../useLiveSubscription';

type Attempt = {
	keys: readonly number[];
	handle: SubscriptionHandle;
	unsubscribe: jest.Mock;
};

const createTransport = () => {
	const attempts: Attempt[] = [];
	const subscribe = jest.fn(
		(keys: readonly number[], handle: SubscriptionHandle) => {
			const unsubscribe = jest.fn();
			attempts.push({ keys, handle, unsubscribe });
			return unsubscribe;
		},
	);
	return {
		subscribe,
		attempts,
		last: () => attempts[attempts.length - 1]!,
	};
};

let appStateListeners: Array<(state: AppStateStatus) => void> = [];
const setAppState = (state: AppStateStatus) =>
	act(() => {
		appStateListeners.forEach((listener) => listener(state));
	});

const advance = (ms: number) =>
	act(() => {
		jest.advanceTimersByTime(ms);
	});

const flushPromises = () => act(async () => {});

type Options = UseLiveSubscriptionOptions<number>;

const renderSubscription = (options: Options) =>
	renderHook((props: Options) => useLiveSubscription(props), {
		initialProps: options,
	});

describe('useLiveSubscription', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		appStateListeners = [];
		(AppState as { currentState: AppStateStatus }).currentState = 'active';
		jest
			.spyOn(AppState, 'addEventListener')
			.mockImplementation((_type, listener) => {
				appStateListeners.push(listener as (state: AppStateStatus) => void);
				return {
					remove: () => {
						appStateListeners = appStateListeners.filter(
							(entry) => entry !== listener,
						);
					},
				};
			});
	});
	afterEach(() => {
		jest.restoreAllMocks();
		jest.useRealTimers();
	});

	it('subscribes immediately for the initial keys and tracks open', () => {
		const transport = createTransport();
		const onOpen = jest.fn();
		const { result } = renderSubscription({
			keys: [1, 2],
			subscribe: transport.subscribe,
			onOpen,
		});

		expect(transport.subscribe).toHaveBeenCalledTimes(1);
		expect(transport.last().keys).toEqual([1, 2]);
		expect(result.current.status).toBe('connecting');

		act(() => transport.last().handle.onOpen());
		expect(result.current.status).toBe('open');
		expect(result.current.keys).toEqual([1, 2]);
		expect(onOpen).toHaveBeenCalledWith([1, 2]);
	});

	it('does nothing for an empty key set', () => {
		const transport = createTransport();
		const { result } = renderSubscription({
			keys: [],
			subscribe: transport.subscribe,
		});
		expect(transport.subscribe).not.toHaveBeenCalled();
		expect(result.current.status).toBe('idle');
	});

	it('does not rebuild when a new array holds the same set', () => {
		const transport = createTransport();
		const { rerender } = renderSubscription({
			keys: [1, 2],
			subscribe: transport.subscribe,
		});
		rerender({ keys: [2, 1], subscribe: transport.subscribe });
		advance(1000);
		expect(transport.subscribe).toHaveBeenCalledTimes(1);
		expect(transport.last().unsubscribe).not.toHaveBeenCalled();
	});

	it('debounces key changes and rebuilds once the set settles', () => {
		const transport = createTransport();
		const { rerender, result } = renderSubscription({
			keys: [1, 2],
			subscribe: transport.subscribe,
			debounceMs: 300,
		});
		const first = transport.last();

		rerender({ keys: [2, 3], subscribe: transport.subscribe, debounceMs: 300 });
		advance(200);
		rerender({ keys: [3, 4], subscribe: transport.subscribe, debounceMs: 300 });
		advance(200);
		expect(transport.subscribe).toHaveBeenCalledTimes(1);
		expect(first.unsubscribe).not.toHaveBeenCalled();

		advance(100);
		expect(first.unsubscribe).toHaveBeenCalledTimes(1);
		expect(first.handle.signal.aborted).toBe(true);
		expect(transport.subscribe).toHaveBeenCalledTimes(2);
		expect(transport.last().keys).toEqual([3, 4]);
		expect(result.current.keys).toEqual([3, 4]);
	});

	it('tears down while disabled and resubscribes when enabled again', () => {
		const transport = createTransport();
		const { rerender, result } = renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
			enabled: true,
		});
		const first = transport.last();

		rerender({ keys: [1], subscribe: transport.subscribe, enabled: false });
		expect(first.unsubscribe).toHaveBeenCalledTimes(1);
		expect(result.current.status).toBe('idle');

		rerender({ keys: [1], subscribe: transport.subscribe, enabled: true });
		expect(transport.subscribe).toHaveBeenCalledTimes(2);
		expect(result.current.status).toBe('connecting');
	});

	it('rebuilds immediately when the transport never opens', () => {
		const transport = createTransport();
		const onError = jest.fn();
		const { result } = renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
			openTimeoutMs: 15_000,
			onError,
		});
		const first = transport.last();

		advance(14_999);
		expect(transport.subscribe).toHaveBeenCalledTimes(1);
		advance(1);
		expect(onError).toHaveBeenCalledTimes(1);
		const [error, info] = onError.mock.calls[0]!;
		expect(error).toBeInstanceOf(OpenTimeoutError);
		expect(info).toEqual({
			reason: 'open-timeout',
			consecutiveErrors: 1,
			retryInMs: 0,
			keys: [1],
		});
		expect(result.current.status).toBe('error');

		advance(1);
		expect(first.unsubscribe).toHaveBeenCalledTimes(1);
		expect(transport.subscribe).toHaveBeenCalledTimes(2);
	});

	it('does not time out a connection that opened in time', () => {
		const transport = createTransport();
		const onError = jest.fn();
		renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
			openTimeoutMs: 1000,
			onError,
		});
		act(() => transport.last().handle.onOpen());
		advance(5000);
		expect(onError).not.toHaveBeenCalled();
		expect(transport.subscribe).toHaveBeenCalledTimes(1);
	});

	it('reconnects after an error following reconnectDelayMs', () => {
		const transport = createTransport();
		const onError = jest.fn();
		const { result } = renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
			reconnectDelayMs: 5000,
			onError,
		});
		const first = transport.last();
		act(() => first.handle.onOpen());

		const failure = new Error('socket closed');
		act(() => first.handle.onError(failure));
		expect(result.current.status).toBe('error');
		expect(result.current.consecutiveErrors).toBe(1);
		expect(onError).toHaveBeenCalledWith(failure, {
			reason: 'error',
			consecutiveErrors: 1,
			retryInMs: 5000,
			keys: [1],
		});

		advance(4999);
		expect(transport.subscribe).toHaveBeenCalledTimes(1);
		advance(1);
		expect(first.unsubscribe).toHaveBeenCalledTimes(1);
		expect(transport.subscribe).toHaveBeenCalledTimes(2);
	});

	it('counts one failure per attempt even if the transport reports several', () => {
		const transport = createTransport();
		const onError = jest.fn();
		const { result } = renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
			reconnectDelayMs: 5000,
			onError,
		});
		const first = transport.last();

		act(() => {
			first.handle.onError(new Error('closed'));
			first.handle.onError(new Error('closed again'));
		});
		expect(onError).toHaveBeenCalledTimes(1);
		expect(result.current.consecutiveErrors).toBe(1);

		act(() => first.handle.onOpen());
		act(() => first.handle.onError(new Error('closed later')));
		expect(onError).toHaveBeenCalledTimes(2);
		expect(result.current.consecutiveErrors).toBe(1);
	});

	it('backs off after repeated open timeouts', () => {
		const transport = createTransport();
		const onError = jest.fn();
		renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
			openTimeoutMs: 1000,
			reconnectDelayMs: 500,
			maxReconnectDelayMs: 2000,
			onError,
		});

		advance(1000);
		advance(1);
		advance(1000);
		advance(1000);
		advance(1000);

		expect(onError.mock.calls.map(([, info]) => info.retryInMs)).toEqual([
			0, 1000, 2000,
		]);
		expect(transport.subscribe).toHaveBeenCalledTimes(3);
		advance(1999);
		expect(transport.subscribe).toHaveBeenCalledTimes(3);
		advance(1);
		expect(transport.subscribe).toHaveBeenCalledTimes(4);
	});

	it('lets a transport that recovers on its own live', () => {
		const transport = createTransport();
		const { result } = renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
			reconnectDelayMs: 5000,
		});
		const first = transport.last();
		act(() => first.handle.onError(new Error('blip')));
		advance(2000);
		act(() => first.handle.onOpen());
		expect(result.current.status).toBe('open');
		expect(result.current.consecutiveErrors).toBe(0);

		advance(10_000);
		expect(transport.subscribe).toHaveBeenCalledTimes(1);
		expect(first.unsubscribe).not.toHaveBeenCalled();
	});

	it('counts consecutive failures across rebuilds and backs off when allowed', () => {
		const transport = createTransport();
		const onError = jest.fn();
		renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
			reconnectDelayMs: 1000,
			maxReconnectDelayMs: 4000,
			openTimeoutMs: 0,
			onError,
		});

		act(() => transport.last().handle.onError(new Error('1')));
		advance(1000);
		act(() => transport.last().handle.onError(new Error('2')));
		advance(2000);
		act(() => transport.last().handle.onError(new Error('3')));
		advance(4000);
		act(() => transport.last().handle.onError(new Error('4')));

		expect(onError.mock.calls.map(([, info]) => info.retryInMs)).toEqual([
			1000, 2000, 4000, 4000,
		]);
		expect(
			onError.mock.calls.map(([, info]) => info.consecutiveErrors),
		).toEqual([1, 2, 3, 4]);

		advance(4000);
		act(() => transport.last().handle.onOpen());
		act(() => transport.last().handle.onError(new Error('5')));
		expect(onError.mock.calls[4]![1]).toMatchObject({
			consecutiveErrors: 1,
			retryInMs: 1000,
		});
	});

	it('rebuilds when the app returns to the foreground', () => {
		const transport = createTransport();
		renderSubscription({ keys: [1], subscribe: transport.subscribe });
		const first = transport.last();

		setAppState('background');
		expect(transport.subscribe).toHaveBeenCalledTimes(1);
		setAppState('active');
		expect(first.unsubscribe).toHaveBeenCalledTimes(1);
		expect(transport.subscribe).toHaveBeenCalledTimes(2);
	});

	it('can opt out of foreground rebuilds', () => {
		const transport = createTransport();
		renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
			resubscribeOnForeground: false,
		});
		expect(appStateListeners).toHaveLength(0);
	});

	it('rebuilds on demand via reconnect()', () => {
		const transport = createTransport();
		const { result } = renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
		});
		const first = transport.last();
		act(() => result.current.reconnect());
		expect(first.unsubscribe).toHaveBeenCalledTimes(1);
		expect(transport.subscribe).toHaveBeenCalledTimes(2);
	});

	it('supports async subscribers and releases late connections', async () => {
		const unsubscribe = jest.fn();
		let resolveSubscribe: (value: () => void) => void = () => {};
		const subscribe = jest.fn(
			() =>
				new Promise<() => void>((resolve) => {
					resolveSubscribe = resolve;
				}),
		);
		const { unmount } = renderSubscription({ keys: [1], subscribe });

		unmount();
		resolveSubscribe(unsubscribe);
		await flushPromises();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('treats a rejected or throwing subscriber as an error', async () => {
		const onError = jest.fn();
		const rejection = new Error('no url');
		const subscribe = jest.fn(() => Promise.reject(rejection));
		renderSubscription({
			keys: [1],
			subscribe,
			onError,
			reconnectDelayMs: 1000,
		});
		await flushPromises();
		expect(onError).toHaveBeenCalledWith(
			rejection,
			expect.objectContaining({ reason: 'error', consecutiveErrors: 1 }),
		);

		const thrown = new Error('sync');
		const throwing = jest.fn(() => {
			throw thrown;
		});
		const { result } = renderSubscription({
			keys: [1],
			subscribe: throwing,
			onError,
		});
		expect(result.current.status).toBe('error');
		expect(onError).toHaveBeenLastCalledWith(thrown, expect.anything());
	});

	it('ignores handle callbacks after teardown', () => {
		const transport = createTransport();
		const onOpen = jest.fn();
		const onError = jest.fn();
		const { unmount } = renderSubscription({
			keys: [1],
			subscribe: transport.subscribe,
			onOpen,
			onError,
		});
		const first = transport.last();
		unmount();
		expect(first.unsubscribe).toHaveBeenCalledTimes(1);
		expect(first.handle.signal.aborted).toBe(true);

		first.handle.onOpen();
		first.handle.onError(new Error('late'));
		expect(onOpen).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(jest.getTimerCount()).toBe(0);
	});

	it('calls the latest subscribe and callbacks without rebuilding', () => {
		const first = createTransport();
		const second = createTransport();
		const { rerender, result } = renderSubscription({
			keys: [1],
			subscribe: first.subscribe,
		});
		rerender({ keys: [1], subscribe: second.subscribe });
		expect(first.last().unsubscribe).not.toHaveBeenCalled();
		expect(second.subscribe).not.toHaveBeenCalled();

		act(() => result.current.reconnect());
		expect(second.subscribe).toHaveBeenCalledTimes(1);
	});
});
