import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
	useTick,
	useTicker,
	type LiveSubscriptionStatus,
} from 'react-native-live-list';
import { formatClock } from '../format';
import { colors, monospace } from '../theme';

interface BoardHeaderProps {
	status: LiveSubscriptionStatus;
	live: boolean;
	onLiveChange: (value: boolean) => void;
	onDropConnection: () => void;
	stats: { label: string; value: number }[];
	lastEvent: string;
}

const STATUS_COLORS: Record<LiveSubscriptionStatus, string> = {
	idle: colors.grey,
	connecting: colors.amber,
	open: colors.green,
	error: colors.red,
};

/** The board clock runs on the same shared ticker as every countdown. */
function BoardClock() {
	const ticker = useTicker();
	const [now, setNow] = useState(() => ticker.now());
	useTick(setNow);
	return <Text style={styles.clock}>{formatClock(now)}</Text>;
}

export function BoardHeader({
	status,
	live,
	onLiveChange,
	onDropConnection,
	stats,
	lastEvent,
}: BoardHeaderProps) {
	return (
		<View style={styles.container}>
			<View style={styles.titleRow}>
				<View>
					<Text style={styles.title}>✈ DEPARTURES</Text>
					<Text style={styles.subtitle}>SFO · Terminal 2 · Gates A–C</Text>
				</View>
				<View style={styles.clockBlock}>
					<BoardClock />
					<View style={styles.statusPill}>
						<View
							style={[styles.dot, { backgroundColor: STATUS_COLORS[status] }]}
						/>
						<Text style={styles.statusText}>{status.toUpperCase()}</Text>
					</View>
				</View>
			</View>

			<View style={styles.controlsRow}>
				<View style={styles.control}>
					<Text style={styles.controlLabel}>Live feed</Text>
					<Switch
						value={live}
						onValueChange={onLiveChange}
						trackColor={{ true: colors.green, false: colors.grey }}
						thumbColor={colors.white}
					/>
				</View>
				<Pressable
					onPress={onDropConnection}
					disabled={status !== 'open'}
					style={({ pressed }) => [
						styles.dropButton,
						(pressed || status !== 'open') && styles.dropButtonDisabled,
					]}
				>
					<Text style={styles.dropButtonText}>DROP CONNECTION</Text>
				</Pressable>
			</View>

			<View style={styles.stats}>
				{stats.map((stat) => (
					<View key={stat.label} style={styles.stat}>
						<Text style={styles.statValue}>{stat.value}</Text>
						<Text style={styles.statLabel}>{stat.label}</Text>
					</View>
				))}
			</View>

			<Text style={styles.event} numberOfLines={1}>
				› {lastEvent}
			</Text>

			<View style={styles.columns}>
				<Text style={[styles.columnHeading, styles.timeHeading]}>TIME</Text>
				<Text style={[styles.columnHeading, styles.destinationHeading]}>
					DESTINATION
				</Text>
				<Text style={[styles.columnHeading, styles.gateHeading]}>GATE</Text>
				<Text style={[styles.columnHeading, styles.statusHeading]}>STATUS</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		backgroundColor: colors.panel,
		paddingTop: 8,
		gap: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	titleRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
	},
	title: {
		fontSize: 22,
		fontWeight: '900',
		letterSpacing: 3,
		color: colors.amber,
	},
	subtitle: {
		marginTop: 2,
		fontSize: 11,
		letterSpacing: 0.5,
		color: colors.muted,
	},
	clockBlock: {
		alignItems: 'flex-end',
		gap: 6,
	},
	clock: {
		fontFamily: monospace,
		fontSize: 20,
		fontWeight: '700',
		fontVariant: ['tabular-nums'],
		color: colors.amber,
	},
	statusPill: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	dot: {
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	statusText: {
		fontSize: 10,
		fontWeight: '700',
		letterSpacing: 1,
		color: colors.muted,
	},
	controlsRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
	},
	control: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	controlLabel: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.white,
	},
	dropButton: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: colors.amber,
	},
	dropButtonDisabled: {
		opacity: 0.35,
	},
	dropButtonText: {
		fontSize: 11,
		fontWeight: '800',
		letterSpacing: 1,
		color: colors.amber,
	},
	stats: {
		flexDirection: 'row',
		gap: 6,
		paddingHorizontal: 16,
	},
	stat: {
		flex: 1,
		alignItems: 'center',
		paddingVertical: 6,
		borderRadius: 4,
		backgroundColor: colors.background,
		borderWidth: 1,
		borderColor: colors.border,
	},
	statValue: {
		fontFamily: monospace,
		fontSize: 16,
		fontWeight: '700',
		fontVariant: ['tabular-nums'],
		color: colors.amber,
	},
	statLabel: {
		fontSize: 9,
		letterSpacing: 0.5,
		color: colors.dim,
	},
	event: {
		paddingHorizontal: 16,
		fontFamily: monospace,
		fontSize: 11,
		color: colors.muted,
	},
	columns: {
		flexDirection: 'row',
		gap: 10,
		paddingLeft: 12,
		paddingRight: 12,
		paddingVertical: 6,
		backgroundColor: colors.background,
	},
	columnHeading: {
		fontSize: 9,
		fontWeight: '700',
		letterSpacing: 1.2,
		color: colors.dim,
	},
	timeHeading: {
		width: 66,
	},
	destinationHeading: {
		flex: 1,
	},
	gateHeading: {
		width: 40,
		textAlign: 'center',
	},
	statusHeading: {
		width: 84,
		textAlign: 'right',
	},
});
