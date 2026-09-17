# react-native-live-list

Keep the on-screen rows of a long list live. One shared ticker drives every
countdown, rows re-render only when their displayed value changes, and realtime
subscriptions cover exactly the rows the user can see.

Built for auction feeds. Fits sports scores, flash sales, order tracking, or any
list where rows count down or update from a server stream.

- Pure TypeScript, no native code. Works with Expo, FlatList and FlashList.
- Transport agnostic: SSE, WebSockets, GraphQL subscriptions or polling.
- Peer dependencies: `react >= 18`, `react-native >= 0.71`.

## Why

A list of 200 auctions with a `setInterval` per card is 200 timers that drift
apart. Subscribing to updates for all 200 keeps 200 topics alive for rows that
are never rendered. Both waste battery and connection slots, and both still show
the wrong time when the device clock is off.

| Problem                                               | What the library does                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A timer per row                                       | `TickerProvider` owns one interval, aligned to whole seconds, started with the first subscriber and stopped with the last. |
| Every row re-renders every tick                       | `useCountdown` re-renders only when the displayed unit changes and stops ticking once the row has expired.                 |
| Countdown drifts or trusts the device clock           | Remaining time is derived from the deadline and the clock on every tick. `clockOffsetMs` corrects for server time.         |
| The server never sent "closed"                        | Thresholds fire once at chosen offsets, including after the deadline, so a row can re-check itself.                        |
| Subscribed to rows that are off screen                | `useViewableKeys` tracks the viewable rows; `useLiveSubscription` keeps one transport open for that set.                   |
| Scrolling churns the connection                       | Key changes are debounced and compared as sets before the transport is rebuilt.                                            |
| Sockets die silently in the background, or never open | The transport is rebuilt on foreground, on error (with optional backoff) and when `onOpen` is not reported in time.        |
| Several mounted tabs each hold a connection           | `enabled` gates the subscription, so only the focused screen connects.                                                     |

## Installation

```sh
npm install react-native-live-list
```

## Quick start

Wrap the app once:

```tsx
import { TickerProvider } from 'react-native-live-list';

export function App() {
	return (
		<TickerProvider>
			<Navigation />
		</TickerProvider>
	);
}
```

Count down in each row:

```tsx
import { useCountdown } from 'react-native-live-list';

function AuctionCard({ auction, onStale }: Props) {
	const { secondsLeft, isExpired } = useCountdown(auction.closeTime, {
		thresholds: [-3, -8],
		onThreshold: () => onStale(auction.id),
	});

	return <Text>{isExpired ? 'Closed' : formatDuration(secondsLeft)}</Text>;
}
```

Subscribe to what is on screen:

```tsx
import { useIsFocused } from '@react-navigation/native';
import EventSource from 'react-native-sse';
import { useLiveSubscription, useViewableKeys } from 'react-native-live-list';

function AuctionList({ auctions, applyUpdate }: Props) {
	const { viewableKeys, onViewableItemsChanged } = useViewableKeys({
		keyExtractor: (auction: Auction) => auction.id,
	});

	useLiveSubscription({
		keys: viewableKeys,
		enabled: useIsFocused(),
		subscribe: (ids, { onOpen, onError }) => {
			const source = new EventSource(`${API}/live?ids=${ids.join(',')}`);
			source.addEventListener('open', onOpen);
			source.addEventListener('error', onError);
			source.addEventListener('message', (event) => {
				if (event.data) applyUpdate(JSON.parse(event.data));
			});
			return () => source.close();
		},
	});

	return (
		<FlatList
			data={auctions}
			renderItem={({ item }) => <AuctionCard auction={item} />}
			keyExtractor={(item) => String(item.id)}
			onViewableItemsChanged={onViewableItemsChanged}
			viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
		/>
	);
}
```

## API

### `<TickerProvider>`

| Prop            | Default | Description                                                                                |
| --------------- | ------- | ------------------------------------------------------------------------------------------ |
| `intervalMs`    | `1000`  | Tick period. Ticks land on whole multiples of the clock, so every countdown flips in sync. |
| `clockOffsetMs` | `0`     | Server time minus device time. Applied to every tick and to `useCountdown`.                |

The interval runs only while at least one hook is subscribed.

### `useCountdown(deadline, options?)`

`deadline` is epoch milliseconds, an ISO string, a `Date`, or `null`.

| Option        | Default    | Description                                                                                                                                                        |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `granularity` | `'second'` | `'second'` or `'minute'`. The hook re-renders only when this unit of the remaining time changes.                                                                   |
| `thresholds`  | `[]`       | Seconds relative to the deadline. `10` fires ten seconds before, `0` at the deadline, `-3` three seconds after. Each fires once and re-arms if the deadline moves. |
| `onThreshold` |            | `(thresholdSeconds, { deadlineMs, remainingMs, now }) => void`                                                                                                     |
| `enabled`     | `true`     | Pause ticking without unmounting.                                                                                                                                  |

Returns `{ deadlineMs, remainingMs, secondsLeft, minutesLeft, isExpired, isActive }`.
`secondsLeft` and `minutesLeft` round up and clamp at zero, like a wall clock.
`isActive` is false once the deadline and every threshold have passed. The hook
then unsubscribes from the ticker, and resubscribes if the deadline changes.

Thresholds use state rather than transitions: a row mounted five seconds after
its deadline with `thresholds: [-3]` fires on the first tick. That is what a
stale row needs. For a one-time cue such as a sound at ten seconds, check
`remainingMs` in the callback.

### `useTick(onTick, { enabled? })`

Runs `onTick(now)` on every shared tick. The latest callback is always used;
changing its identity does not re-register.

### `useTicker()`

Returns `{ intervalMs, now(), subscribe(listener), listenerCount() }` for custom
integrations.

### `useViewableKeys({ keyExtractor, ignoreEmpty?, onChange? })`

Returns `{ viewableKeys, onViewableItemsChanged }`.

- `onViewableItemsChanged` never changes identity. FlatList throws if this prop
  is swapped after mount.
- `viewableKeys` keeps the same reference while its contents are unchanged, and
  is compared as a set, so scrolling within the same rows does not update it.
- `ignoreEmpty: true` keeps the last set when the list reports nothing viewable,
  for example while a dataset is swapped.

Works with FlatList, SectionList and FlashList. Pair it with a
`viewabilityConfig` that suits the rows.

### `useLiveSubscription(options)`

| Option                    | Default            | Description                                                                                                   |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `keys`                    |                    | Keys to stay subscribed to, usually `viewableKeys`.                                                           |
| `subscribe`               |                    | `(keys, handle) => unsubscribe`. May return a promise.                                                        |
| `enabled`                 | `true`             | Hold a transport only while true. Pass screen focus here.                                                     |
| `debounceMs`              | `300`              | Wait for the key set to settle before rebuilding.                                                             |
| `resubscribeOnForeground` | `true`             | Rebuild when the app returns from the background.                                                             |
| `openTimeoutMs`           | `15000`            | Rebuild immediately if `handle.onOpen()` was not called in time. `0` disables.                                |
| `reconnectDelayMs`        | `5000`             | Delay before rebuilding after `handle.onError()`.                                                             |
| `maxReconnectDelayMs`     | `reconnectDelayMs` | Cap for exponential backoff. Equal to the base delay means no backoff.                                        |
| `onOpen`                  |                    | `(keys) => void`                                                                                              |
| `onError`                 |                    | `(error, { reason, consecutiveErrors, retryInMs, keys }) => void`. `reason` is `'error'` or `'open-timeout'`. |

The `handle` passed to `subscribe` has:

- `onOpen()`: marks the transport healthy, clears the open watchdog and any
  pending rebuild. A transport that recovers on its own is left alone.
- `onError(error?)`: schedules a rebuild. Call it for dropped connections too.
- `signal`: an `AbortSignal` that aborts when this attempt is torn down.

Returns `{ status, consecutiveErrors, keys, reconnect() }`. `status` is
`'idle' | 'connecting' | 'open' | 'error'`. Call `reconnect()` after refreshing
credentials so the next transport picks up the new headers.

Each rebuild replaces the whole transport. That matches SSE endpoints that take
the id list in the URL. Incremental add and remove for topic-based transports
is on the roadmap.

### `useAppForeground(callback, enabled?)`

Calls `callback` when the app moves from `background` or `inactive` to
`active`.

### Utilities

- `toEpochMs(deadline)`: normalizes a deadline to epoch ms or `null`.
- `sameKeySet(a, b)`: order-insensitive key list equality.

## Recipes

### Server clock offset

```tsx
const [offset, setOffset] = useState(0);

useEffect(() => {
	fetch(`${API}/time`).then(async (response) => {
		const { now } = await response.json();
		setOffset(now - Date.now());
	});
}, []);

<TickerProvider clockOffsetMs={offset}>{children}</TickerProvider>;
```

### Authenticated SSE with token refresh

```tsx
const { reconnect } = useLiveSubscription({
	keys: viewableKeys,
	subscribe: async (ids, { onOpen, onError, signal }) => {
		const token = await getAccessToken();
		if (signal.aborted) return;
		const source = new EventSource(buildUrl(ids), {
			headers: { Authorization: `Bearer ${token}` },
		});
		source.addEventListener('open', onOpen);
		source.addEventListener('error', (event) => {
			if (event.type === 'error' && event.xhrStatus === 401) {
				refreshAccessToken().then(reconnect);
				return;
			}
			onError(event);
		});
		source.addEventListener('message', handleMessage);
		return () => source.close();
	},
});
```

### WebSocket topics

```tsx
subscribe: (ids, { onOpen, onError }) => {
	const socket = new WebSocket(WS_URL);
	socket.onopen = () => {
		socket.send(JSON.stringify({ subscribe: ids }));
		onOpen();
	};
	socket.onerror = onError;
	socket.onclose = () => onError(new Error('closed'));
	socket.onmessage = (event) => applyUpdate(JSON.parse(event.data));
	return () => socket.close();
};
```

### A live indicator

```tsx
const { status } = useLiveSubscription(options);
<Dot color={status === 'open' ? 'green' : 'grey'} />;
```

### Telemetry

```tsx
onError: (error, { reason, consecutiveErrors }) => {
	if (consecutiveErrors === 3) {
		report('live subscription failing repeatedly', { reason, error });
	}
};
```

## Testing with fake timers

The hooks work with Jest fake timers. Two things to know:

- Advance the clock in steps of one tick to assert one render per tick. Several
  timer callbacks inside a single `act` are batched by React into one render.
- A rebuild scheduled with a zero delay from inside another timer fires on the
  next `advanceTimersByTime(1)`, not on `advanceTimersByTime(0)`.

## Roadmap

- Incremental (per-key) subscriptions for topic-based transports.
- `react-native-live-list/sse` adapter for `react-native-sse`.
- Example app.

## License

MIT
