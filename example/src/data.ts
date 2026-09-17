import type { Flight } from './types';

const DESTINATIONS: ReadonlyArray<readonly [string, string]> = [
	['London', 'LHR'],
	['Tokyo', 'HND'],
	['New York', 'JFK'],
	['Paris', 'CDG'],
	['Mexico City', 'MEX'],
	['Madrid', 'MAD'],
	['São Paulo', 'GRU'],
	['Toronto', 'YYZ'],
	['Seoul', 'ICN'],
	['Dubai', 'DXB'],
	['Sydney', 'SYD'],
	['Amsterdam', 'AMS'],
	['Chicago', 'ORD'],
	['Lima', 'LIM'],
	['Rome', 'FCO'],
	['Singapore', 'SIN'],
	['Los Angeles', 'LAX'],
	['Buenos Aires', 'EZE'],
	['Frankfurt', 'FRA'],
	['Bogotá', 'BOG'],
	['Vancouver', 'YVR'],
	['Lisbon', 'LIS'],
	['Montevideo', 'MVD'],
	['Miami', 'MIA'],
];

const AIRLINES: ReadonlyArray<readonly [string, string]> = [
	['NL', 'Northlight'],
	['SK', 'Skyway'],
	['MD', 'Meridian'],
	['PC', 'Pacifica'],
	['BB', 'Bluebird'],
	['AU', 'Aurora Air'],
	['CS', 'Coastal'],
	['SM', 'Summit Air'],
];

const GATES = ['A2', 'A5', 'A9', 'B1', 'B4', 'B7', 'B12', 'C3', 'C6', 'C10'];

/** Small seeded generator so every launch shows the same board. */
const createRandom = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const pickGate = (random: () => number = Math.random) =>
	GATES[Math.floor(random() * GATES.length)];

export function createFlights(count: number, now = Date.now()): Flight[] {
	const random = createRandom(7);
	const flights = Array.from({ length: count }, (_, index): Flight => {
		const [city, airportCode] = DESTINATIONS[index % DESTINATIONS.length];
		const [carrier, airline] = AIRLINES[Math.floor(random() * AIRLINES.length)];
		// The first flights leave within the first minute so a short recording
		// shows boarding, a delay pushing the clock out, departure and re-check.
		// The rest are minutes to hours away and count down by the minute.
		const secondsLeft =
			index < 6 ? 15 + index * 12 : 120 + Math.floor(random() * 5400);
		const departsAt = now + secondsLeft * 1000;
		return {
			id: `f-${index + 1}`,
			airline,
			flightNumber: `${carrier} ${100 + Math.floor(random() * 800)}`,
			city,
			airportCode,
			gate: pickGate(random),
			scheduledAt: departsAt,
			departsAt,
			status: 'scheduled',
		};
	});
	return flights.sort((a, b) => a.departsAt - b.departsAt);
}
