import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
	useLiveSubscription,
	useTick,
	useTicker,
	useViewableKeys,
} from 'react-native-live-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BoardHeader } from '../components/BoardHeader';
import { FlightRow } from '../components/FlightRow';
import { MockFlightServer } from '../mockServer';
import { colors } from '../theme';
import type { Flight, FlightUpdate } from '../types';

const server = new MockFlightServer();

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };

const keyExtractor = (flight: Flight) => flight.id;

export function DeparturesBoard() {
	const insets = useSafeAreaInsets();
	const [flights, setFlights] = useState<Flight[]>(() => server.list());
	const flightsRef = useRef(flights);
	useEffect(() => {
		flightsRef.current = flights;
	}, [flights]);

	const [live, setLive] = useState(true);
	const [updateCount, setUpdateCount] = useState(0);
	const [openCount, setOpenCount] = useState(0);
	const [lastEvent, setLastEvent] = useState(
		'Scroll the board: only visible flights stream',
	);

	const applyUpdate = useCallback((update: FlightUpdate) => {
		const updatedAt = Date.now();
		setFlights((previous) =>
			previous.map((flight) =>
				flight.id === update.id ? { ...flight, ...update, updatedAt } : flight,
			),
		);
		setUpdateCount((count) => count + 1);
	}, []);

	const { viewableKeys, onViewableItemsChanged } = useViewableKeys({
		keyExtractor,
	});

	const subscription = useLiveSubscription({
		keys: viewableKeys,
		enabled: live,
		reconnectDelayMs: 2000,
		maxReconnectDelayMs: 8000,
		openTimeoutMs: 5000,
		subscribe: (ids, handle) => server.subscribe(ids, handle, applyUpdate),
		onOpen: (ids) => {
			setOpenCount((count) => count + 1);
			setLastEvent(`Feed open for ${ids.length} visible flights`);
		},
		onError: (error, { consecutiveErrors, retryInMs }) => {
			const message = error instanceof Error ? error.message : 'Feed error';
			setLastEvent(
				`${message} · retry #${consecutiveErrors} in ${retryInMs / 1000}s`,
			);
		},
	});

	const handleStale = useCallback(
		(id: string) => {
			const flight = flightsRef.current.find((entry) => entry.id === id);
			setLastEvent(
				`${flight?.flightNumber ?? id} past departure unconfirmed, re-checking`,
			);
			server.fetch(id).then((latest) => latest && applyUpdate(latest));
		},
		[applyUpdate],
	);

	const handleDropConnection = useCallback(() => {
		server.dropConnections();
	}, []);

	const ticker = useTicker();
	const [listenerCount, setListenerCount] = useState(() =>
		ticker.listenerCount(),
	);
	useTick(() => setListenerCount(ticker.listenerCount()));

	const liveIds = useMemo(
		() => new Set(subscription.keys),
		[subscription.keys],
	);

	const renderItem = useCallback(
		({ item }: { item: Flight }) => (
			<FlightRow
				flight={item}
				isLive={liveIds.has(item.id)}
				onStale={handleStale}
			/>
		),
		[liveIds, handleStale],
	);

	const stats = [
		{ label: 'visible', value: viewableKeys.length },
		{ label: 'streamed', value: subscription.keys.length },
		{ label: 'ticker subs', value: listenerCount },
		{ label: 'updates', value: updateCount },
		{ label: 'connects', value: openCount },
	];

	return (
		<View style={[styles.screen, { paddingTop: insets.top }]}>
			<BoardHeader
				status={subscription.status}
				live={live}
				onLiveChange={setLive}
				onDropConnection={handleDropConnection}
				stats={stats}
				lastEvent={lastEvent}
			/>
			<FlatList
				data={flights}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				onViewableItemsChanged={onViewableItemsChanged}
				viewabilityConfig={VIEWABILITY_CONFIG}
				contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.background,
	},
});
