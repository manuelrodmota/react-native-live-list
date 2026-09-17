import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useCountdown } from 'react-native-live-list';
import { formatSeconds, formatTime } from '../format';
import { colors, monospace } from '../theme';
import type { Flight, FlightStatus } from '../types';

interface FlightRowProps {
	flight: Flight;
	/** Whether the current stream covers this row. */
	isLive: boolean;
	/** The departure time passed but the server never confirmed it. */
	onStale: (id: string) => void;
}

/** Under this much time the row counts seconds instead of minutes. */
const SOON_MS = 2 * 60_000;
const URGENT_SECONDS = 10;

const BADGES: Record<
	FlightStatus | 'delayed',
	{ label: string; color: string }
> = {
	scheduled: { label: 'ON TIME', color: colors.green },
	delayed: { label: 'DELAYED', color: colors.amber },
	boarding: { label: 'BOARDING', color: colors.blue },
	'final-call': { label: 'FINAL CALL', color: colors.red },
	departed: { label: 'DEPARTED', color: colors.grey },
	cancelled: { label: 'CANCELLED', color: colors.red },
};

function FlightRowComponent({ flight, isLive, onStale }: FlightRowProps) {
	const isActive =
		flight.status !== 'departed' && flight.status !== 'cancelled';
	const isSoon = flight.departsAt - Date.now() < SOON_MS;
	const { secondsLeft, minutesLeft, isExpired } = useCountdown(
		isActive ? flight.departsAt : null,
		{
			granularity: isSoon ? 'second' : 'minute',
			thresholds: [-3, -8],
			onThreshold: () => onStale(flight.id),
		},
	);

	const flash = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		if (!flight.updatedAt) return;
		flash.setValue(1);
		Animated.timing(flash, {
			toValue: 0,
			duration: 800,
			useNativeDriver: false,
		}).start();
	}, [flight.updatedAt, flash]);

	const backgroundColor = flash.interpolate({
		inputRange: [0, 1],
		outputRange: [colors.row, colors.rowFlash],
	});

	const isDelayed = flight.departsAt > flight.scheduledAt;
	const badge =
		BADGES[
			flight.status === 'scheduled' && isDelayed ? 'delayed' : flight.status
		];
	const isUrgent =
		flight.status === 'final-call' || (isSoon && secondsLeft <= URGENT_SECONDS);
	const gateChanged = flight.remark?.startsWith('Gate') ?? false;

	let countdown: string | null = null;
	if (isActive) {
		if (isExpired) countdown = 'NOW';
		else if (isSoon) countdown = formatSeconds(secondsLeft);
		else countdown = `${minutesLeft} min`;
	}

	let note: string | null = null;
	if (isActive && isDelayed) note = `Sched ${formatTime(flight.scheduledAt)}`;
	else if (isActive && gateChanged) note = flight.remark ?? null;

	return (
		<Animated.View
			style={[
				styles.row,
				{ backgroundColor },
				isLive && styles.rowLive,
				!isActive && styles.rowInactive,
			]}
		>
			<View style={styles.timeColumn}>
				<Text
					style={[
						styles.countdown,
						isUrgent && styles.countdownUrgent,
						!isActive && styles.countdownInactive,
					]}
				>
					{countdown ?? '--:--'}
				</Text>
				<Text style={styles.scheduled}>{formatTime(flight.departsAt)}</Text>
			</View>

			<View style={styles.destinationColumn}>
				<Text style={styles.city} numberOfLines={1}>
					{flight.city.toUpperCase()}
					<Text style={styles.airportCode}> {flight.airportCode}</Text>
				</Text>
				<Text style={styles.flight} numberOfLines={1}>
					{flight.flightNumber} · {flight.airline}
				</Text>
			</View>

			<View style={styles.gateColumn}>
				<Text style={styles.columnLabel}>GATE</Text>
				<Text style={[styles.gate, gateChanged && styles.gateChanged]}>
					{flight.gate}
				</Text>
			</View>

			<View style={styles.statusColumn}>
				<View style={[styles.badge, { borderColor: badge.color }]}>
					<Text style={[styles.badgeText, { color: badge.color }]}>
						{badge.label}
					</Text>
				</View>
				{note ? (
					<Text style={styles.remark} numberOfLines={1}>
						{note}
					</Text>
				) : null}
			</View>
		</Animated.View>
	);
}

export const FlightRow = memo(FlightRowComponent);

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingVertical: 12,
		paddingLeft: 9,
		paddingRight: 12,
		borderLeftWidth: 3,
		borderLeftColor: 'transparent',
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	rowLive: {
		borderLeftColor: colors.green,
	},
	rowInactive: {
		opacity: 0.55,
	},
	timeColumn: {
		width: 66,
	},
	countdown: {
		fontFamily: monospace,
		fontSize: 17,
		fontWeight: '700',
		fontVariant: ['tabular-nums'],
		color: colors.amber,
	},
	countdownUrgent: {
		color: colors.red,
	},
	countdownInactive: {
		color: colors.dim,
	},
	scheduled: {
		fontFamily: monospace,
		fontSize: 11,
		color: colors.dim,
		marginTop: 2,
	},
	destinationColumn: {
		flex: 1,
		gap: 2,
	},
	city: {
		fontSize: 15,
		fontWeight: '800',
		letterSpacing: 0.6,
		color: colors.white,
	},
	airportCode: {
		fontWeight: '500',
		letterSpacing: 0,
		color: colors.muted,
	},
	flight: {
		fontFamily: monospace,
		fontSize: 11,
		color: colors.muted,
	},
	gateColumn: {
		width: 40,
		alignItems: 'center',
	},
	columnLabel: {
		fontSize: 9,
		letterSpacing: 1,
		color: colors.dim,
	},
	gate: {
		fontFamily: monospace,
		fontSize: 15,
		fontWeight: '700',
		color: colors.white,
	},
	gateChanged: {
		color: colors.amber,
	},
	statusColumn: {
		width: 84,
		alignItems: 'flex-end',
		gap: 3,
	},
	badge: {
		borderWidth: 1,
		borderRadius: 4,
		paddingHorizontal: 6,
		paddingVertical: 3,
	},
	badgeText: {
		fontSize: 9,
		fontWeight: '800',
		letterSpacing: 0.8,
	},
	remark: {
		fontSize: 10,
		color: colors.muted,
	},
});
