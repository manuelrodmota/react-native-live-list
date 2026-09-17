<div align="center">
  <h1>react-native-live-list</h1>

  <a href="https://www.npmjs.com/package/react-native-live-list">
    <img src="https://img.shields.io/npm/v/react-native-live-list.svg" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/react-native-live-list">
    <img src="https://img.shields.io/npm/dm/react-native-live-list" alt="npm downloads" />
  </a>
  <a href="https://github.com/manuelrodmota/react-native-live-list/actions/workflows/ci.yml">
    <img src="https://github.com/manuelrodmota/react-native-live-list/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" />
  </a>

  <p><strong>Keep the rows on screen alive. ⚡</strong></p>
  <p>One shared ticker, drift-free countdowns and viewport-scoped realtime subscriptions for React Native lists.</p>
</div>

Auction feeds, live scores, flash sales, delivery tracking, crypto tickers, presence indicators: any list where rows count down or update from a server stream.

## ✨ Features

- ⏱️ **One ticker, not one per row** - A single clock-aligned interval drives every countdown on screen. It starts with the first subscriber and stops with the last.
- 🎯 **Re-render only when it matters** - Rows update when the displayed second (or minute) changes, not on every tick, and go quiet once they expire.
- 🕰️ **Drift-free, server-true time** - Remaining time is derived from the deadline and the clock on every tick. Pass a server offset and every row agrees with your backend.
- 👀 **Subscribe to what is visible** - Track the viewable rows and hold exactly one realtime connection for that set, debounced against scrolling.
- 🔌 **Bring your own transport** - SSE, WebSockets, GraphQL subscriptions or polling. You open the connection, the hooks decide when.
- 🛡️ **Self-healing connections** - Rebuilt on foreground, on error (with optional backoff) and when a connection never opens. Focus-gated so only the active screen connects.
- 🪶 **Pure TypeScript, zero native code** - Works with Expo, FlatList, FlashList and React Native 0.71+.
- 🧪 **Deterministic** - Fully covered with fake-timer tests.

## 🤔 Why

Screens full of realtime components tend to grow the same way: every row gets its own `setInterval`, and the screen subscribes to updates for every row in the dataset. With 200 rows that is 200 timers drifting apart and 200 live topics for content that is mostly off screen. Battery drains, connection slots run out, and the countdowns are still wrong when the device clock is off.

`react-native-live-list` splits the problem in two. **Time** is handled once, at the top, and shared. **Data** is subscribed per viewport, not per dataset.

| Without 🐢                                 | With ⚡                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| A timer per row                            | `TickerProvider` owns one interval, aligned to whole seconds.                                       |
| Every row re-renders every tick            | `useCountdown` re-renders only when the displayed unit changes and stops once the row expires.      |
| Countdowns drift or trust the device clock | Remaining time is recomputed from the deadline each tick. `clockOffsetMs` corrects for server time. |
| The server never sent "closed"             | Thresholds fire once at chosen offsets, including after the deadline, so a row can re-check itself. |
| Subscribed to rows that are off screen     | `useViewableKeys` tracks the viewable rows. `useLiveSubscription` connects for that set only.       |
| Scrolling churns the connection            | Key changes are debounced and compared as sets before the transport is rebuilt.                     |
| Sockets die silently in the background     | The transport is rebuilt on foreground, on error and when `onOpen` is never reported.               |
| Every mounted tab holds its own connection | `enabled` gates the subscription, so only the focused screen connects.                              |

## 📦 Installation

```sh
npm install react-native-live-list
```

```sh
npx expo install react-native-live-list
```

No native code, so there is nothing to link and no `pod install`. Peer dependencies are `react >= 18` and `react-native >= 0.71`.

## 🚀 Usage

### 1. Wrap the app once

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

### 2. Count down in each row

```tsx
import { useCountdown } from 'react-native-live-list';

function LiveRow({ item, onStale }: Props) {
	const { secondsLeft, isExpired } = useCountdown(item.endsAt, {
		thresholds: [-3, -8],
		onThreshold: () => onStale(item.id),
	});

	return <Text>{isExpired ? 'Ended' : formatDuration(secondsLeft)}</Text>;
}
```

### 3. Subscribe to what is on screen

```tsx
import { useIsFocused } from '@react-navigation/native';
import EventSource from 'react-native-sse';
import { useLiveSubscription, useViewableKeys } from 'react-native-live-list';

function LiveList({ items, applyUpdate }: Props) {
	const { viewableKeys, onViewableItemsChanged } = useViewableKeys({
		keyExtractor: (item: Item) => item.id,
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
			data={items}
			renderItem={({ item }) => <LiveRow item={item} />}
			keyExtractor={(item) => String(item.id)}
			onViewableItemsChanged={onViewableItemsChanged}
			viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
		/>
	);
}
```

## 📖 API

### `<TickerProvider>`

| Prop            | Type     | Default | Description                                                                                |
| --------------- | -------- | ------- | ------------------------------------------------------------------------------------------ |
| `intervalMs`    | `number` | `1000`  | Tick period. Ticks land on whole multiples of the clock, so every countdown flips in sync. |
| `clockOffsetMs` | `number` | `0`     | Server time minus device time. Applied to every tick and to `useCountdown`.                |

The interval runs only while at least one hook is subscribed.

### `useCountdown(deadline, options?)`

`deadline` is epoch milliseconds, an ISO string, a `Date`, or `null`.

| Option        | Type                     | Default    | Description                                                                                                                                                        |
| ------------- | ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `granularity` | `'second' \| 'minute'`   | `'second'` | The hook re-renders only when this unit of the remaining time changes.                                                                                             |
| `thresholds`  | `number[]`               | `[]`       | Seconds relative to the deadline. `10` fires ten seconds before, `0` at the deadline, `-3` three seconds after. Each fires once and re-arms if the deadline moves. |
| `onThreshold` | `(seconds, ctx) => void` |            | `ctx` is `{ deadlineMs, remainingMs, now }`.                                                                                                                       |
| `enabled`     | `boolean`                | `true`     | Pause ticking without unmounting.                                                                                                                                  |

Returns `{ deadlineMs, remainingMs, secondsLeft, minutesLeft, isExpired, isActive }`.

- `secondsLeft` and `minutesLeft` round up and clamp at zero, like a wall clock.
- `isActive` turns false once the deadline and every threshold have passed. The hook then unsubscribes from the ticker, and resubscribes if the deadline changes.
- Thresholds use state rather than transitions: a row mounted five seconds after its deadline with `thresholds: [-3]` fires on the first tick. That is what a stale row needs. For a one-time cue such as a sound at ten seconds, check `remainingMs` in the callback.

### `useTick(onTick, options?)`

Runs `onTick(now)` on every shared tick. The latest callback is always used; changing its identity does not re-register. Pass `{ enabled: false }` to pause.

### `useTicker()`

Returns `{ intervalMs, now(), subscribe(listener), listenerCount() }` for custom integrations.

### `useViewableKeys(options)`

| Option         | Type                   | Default | Description                                                                                       |
| -------------- | ---------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `keyExtractor` | `(item, index) => Key` |         | Key for each viewable row.                                                                        |
| `ignoreEmpty`  | `boolean`              | `false` | Keep the last set when the list reports nothing viewable, for example while a dataset is swapped. |
| `onChange`     | `(keys) => void`       |         | Called when the set changes.                                                                      |

Returns `{ viewableKeys, onViewableItemsChanged }`.

- `onViewableItemsChanged` never changes identity. FlatList throws if this prop is swapped after mount.
- `viewableKeys` keeps the same reference while its contents are unchanged and is compared as a set, so scrolling within the same rows does not update it.
- Works with FlatList, SectionList and FlashList. Pair it with a `viewabilityConfig` that suits your rows.

### `useLiveSubscription(options)`

| Option                    | Type                            | Default            | Description                                                                                            |
| ------------------------- | ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `keys`                    | `Key[]`                         |                    | Keys to stay subscribed to, usually `viewableKeys`.                                                    |
| `subscribe`               | `(keys, handle) => unsubscribe` |                    | Opens the transport. May return a promise.                                                             |
| `enabled`                 | `boolean`                       | `true`             | Hold a transport only while true. Pass screen focus here.                                              |
| `debounceMs`              | `number`                        | `300`              | Wait for the key set to settle before rebuilding.                                                      |
| `resubscribeOnForeground` | `boolean`                       | `true`             | Rebuild when the app returns from the background.                                                      |
| `openTimeoutMs`           | `number`                        | `15000`            | Rebuild immediately if `handle.onOpen()` was not called in time. `0` disables.                         |
| `reconnectDelayMs`        | `number`                        | `5000`             | Delay before rebuilding after `handle.onError()`.                                                      |
| `maxReconnectDelayMs`     | `number`                        | `reconnectDelayMs` | Cap for exponential backoff. Equal to the base delay means no backoff.                                 |
| `onOpen`                  | `(keys) => void`                |                    |                                                                                                        |
| `onError`                 | `(error, info) => void`         |                    | `info` is `{ reason, consecutiveErrors, retryInMs, keys }`. `reason` is `'error'` or `'open-timeout'`. |

The `handle` passed to `subscribe` has:

- `onOpen()` marks the transport healthy and clears the open watchdog and any pending rebuild. A transport that recovers on its own is left alone.
- `onError(error?)` schedules a rebuild. Call it for dropped connections too.
- `signal` is an `AbortSignal` that aborts when this attempt is torn down.

Returns `{ status, consecutiveErrors, keys, reconnect() }`. `status` is `'idle' | 'connecting' | 'open' | 'error'`. Call `reconnect()` after refreshing credentials so the next transport picks up the new headers.

Each rebuild replaces the whole transport, which matches SSE endpoints that take the id list in the URL. Incremental add and remove for topic-based transports is on the roadmap.

### `useAppForeground(callback, enabled?)`

Calls `callback` when the app moves from `background` or `inactive` to `active`.

### Utilities

- `toEpochMs(deadline)` normalizes a deadline to epoch ms or `null`.
- `sameKeySet(a, b)` is order-insensitive key list equality.

## 🍳 Recipes

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

## 🧪 Testing with fake timers

The hooks work with Jest fake timers. Two things to know:

- Advance the clock in steps of one tick to assert one render per tick. Several timer callbacks inside a single `act` are batched by React into one render.
- A rebuild scheduled with a zero delay from inside another timer fires on the next `advanceTimersByTime(1)`, not on `advanceTimersByTime(0)`.

## 🗺️ Roadmap

- Incremental (per-key) subscriptions for topic-based transports.
- `react-native-live-list/sse` adapter for `react-native-sse`.
- Example app.

## 🤝 Contributing

Issues and pull requests are welcome. Run `npm test`, `npm run typecheck` and `npm run format` before opening one.

## 📄 License

MIT
