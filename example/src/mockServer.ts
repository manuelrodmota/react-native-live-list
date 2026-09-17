import type { SubscriptionHandle } from 'react-native-live-list';
import { createFlights, pickGate } from './data';
import type { Flight, FlightUpdate } from './types';

interface Connection {
	handle: SubscriptionHandle;
	openTimer: ReturnType<typeof setTimeout> | null;
	updateTimer: ReturnType<typeof setInterval> | null;
}

export interface MockServerOptions {
	/** Simulated round trip, applied to connects and reads. */
	latencyMs?: number;
	/** Time between operational updates on the subscribed flights. */
	updateEveryMs?: number;
}

const BOARDING_MS = 45_000;
const FINAL_CALL_MS = 15_000;

const wait = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * An in-memory stand-in for a flight information backend. It owns the truth
 * about every flight, streams updates only for the ids a connection asked for
 * (boarding, final call, gate changes and delays that move the departure
 * time), and marks a flight departed lazily the first time it is read after
 * its estimated departure.
 */
export class MockFlightServer {
	private readonly flights = new Map<string, Flight>();
	private readonly connections = new Set<Connection>();
	private readonly latencyMs: number;
	private readonly updateEveryMs: number;

	constructor({
		latencyMs = 400,
		updateEveryMs = 700,
	}: MockServerOptions = {}) {
		this.latencyMs = latencyMs;
		this.updateEveryMs = updateEveryMs;
		for (const flight of createFlights(60)) {
			this.flights.set(flight.id, flight);
		}
	}

	/** Initial board load. */
	list(): Flight[] {
		return Array.from(this.flights.values(), (flight) => ({
			...this.settle(flight),
		}));
	}

	/** One-off read, used by rows that passed their departure unconfirmed. */
	async fetch(id: string): Promise<Flight | undefined> {
		await wait(this.latencyMs);
		const flight = this.flights.get(id);
		return flight && { ...this.settle(flight) };
	}

	/**
	 * Opens a stream for `ids`. Shaped like the `subscribe` option of
	 * `useLiveSubscription`: report open and errors through the handle and
	 * return the function that closes the stream.
	 */
	subscribe(
		ids: readonly string[],
		handle: SubscriptionHandle,
		onUpdate: (update: FlightUpdate) => void,
	): () => void {
		const connection: Connection = {
			handle,
			openTimer: null,
			updateTimer: null,
		};
		this.connections.add(connection);

		connection.openTimer = setTimeout(() => {
			connection.openTimer = null;
			handle.onOpen();
			connection.updateTimer = setInterval(() => {
				const update = this.nextUpdate(ids);
				if (update) onUpdate(update);
			}, this.updateEveryMs);
		}, this.latencyMs);

		return () => this.close(connection);
	}

	/** Simulates the socket dying: every open stream reports an error. */
	dropConnections(): number {
		const dropped = Array.from(this.connections);
		for (const connection of dropped) {
			this.close(connection);
			connection.handle.onError(new Error('Connection reset by peer'));
		}
		return dropped.length;
	}

	get connectionCount(): number {
		return this.connections.size;
	}

	private close(connection: Connection) {
		if (connection.openTimer) clearTimeout(connection.openTimer);
		if (connection.updateTimer) clearInterval(connection.updateTimer);
		connection.openTimer = null;
		connection.updateTimer = null;
		this.connections.delete(connection);
	}

	private nextUpdate(ids: readonly string[]): FlightUpdate | null {
		const active: Flight[] = [];
		for (const id of ids) {
			const flight = this.flights.get(id);
			if (flight && isActive(this.settle(flight))) active.push(flight);
		}
		if (active.length === 0) return null;

		const flight = active[Math.floor(Math.random() * active.length)];
		const now = Date.now();
		const remainingMs = flight.departsAt - now;
		const roll = Math.random();

		if (flight.status === 'scheduled' && remainingMs < BOARDING_MS) {
			flight.status = 'boarding';
			flight.remark = 'Boarding';
		} else if (flight.status === 'boarding' && remainingMs < FINAL_CALL_MS) {
			flight.status = 'final-call';
			flight.remark = 'Final call';
		} else if (roll < 0.2) {
			// A delay pushes the estimated departure out; the countdown re-arms.
			flight.departsAt += 20_000 + Math.floor(Math.random() * 3) * 10_000;
			flight.remark = 'Delayed';
		} else if (roll < 0.35) {
			flight.gate = pickGate();
			flight.remark = `Gate changed to ${flight.gate}`;
		} else if (roll < 0.37 && flight.status === 'scheduled') {
			flight.status = 'cancelled';
			flight.remark = 'Cancelled';
		} else {
			return null;
		}

		return {
			id: flight.id,
			status: flight.status,
			gate: flight.gate,
			departsAt: flight.departsAt,
			remark: flight.remark,
		};
	}

	private settle(flight: Flight): Flight {
		if (isActive(flight) && flight.departsAt <= Date.now()) {
			flight.status = 'departed';
			flight.remark = 'Departed';
		}
		return flight;
	}
}

const isActive = (flight: Flight) =>
	flight.status !== 'departed' && flight.status !== 'cancelled';
