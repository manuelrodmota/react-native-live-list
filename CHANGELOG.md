# Changelog

## Unreleased

### Added

- Example app under `example/`: an Expo Go airport departures board with a mock realtime server that exercises the ticker, both countdown granularities, thresholds, viewport subscriptions and reconnect behaviour.

## 0.1.0 - 2026-09-17

### Added

- `TickerProvider`, `useTick` and `useTicker`: one shared, clock-aligned interval per app.
- `useCountdown`: deadline-derived countdown with bucketed re-renders, threshold callbacks and automatic settling.
- `useViewableKeys`: stable `onViewableItemsChanged` handler that tracks the viewable row keys as a set.
- `useLiveSubscription`: viewport-scoped transport lifecycle with debounce, foreground and error rebuilds, open watchdog and optional backoff.
- `useAppForeground`, `toEpochMs` and `sameKeySet` utilities.
