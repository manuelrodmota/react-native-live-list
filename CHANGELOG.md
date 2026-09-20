# Changelog

## Unreleased

### Fixed

- A listener that throws no longer stops the shared ticker or skips the other listeners; the error is rethrown after the tick.
- `useCountdown` with `granularity: 'minute'` settles as soon as its last threshold has fired instead of at the next minute boundary.
- `useLiveSubscription` counts one failure per attempt, so transports that report several errors while reconnecting (for example `react-native-sse`) no longer inflate `consecutiveErrors` or repeat `onError`.

### Changed

- Repeated open timeouts back off like other failures; only the first one rebuilds immediately.

## 0.1.1 - 2026-09-17

### Added

- Example app under `example/`: an Expo Go airport departures board with a mock realtime server that exercises the ticker, both countdown granularities, thresholds, viewport subscriptions and reconnect behaviour.

## 0.1.0 - 2026-09-17

### Added

- `TickerProvider`, `useTick` and `useTicker`: one shared, clock-aligned interval per app.
- `useCountdown`: deadline-derived countdown with bucketed re-renders, threshold callbacks and automatic settling.
- `useViewableKeys`: stable `onViewableItemsChanged` handler that tracks the viewable row keys as a set.
- `useLiveSubscription`: viewport-scoped transport lifecycle with debounce, foreground and error rebuilds, open watchdog and optional backoff.
- `useAppForeground`, `toEpochMs` and `sameKeySet` utilities.
