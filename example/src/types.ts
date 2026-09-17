export type FlightStatus =
	'scheduled' | 'boarding' | 'final-call' | 'departed' | 'cancelled';

export interface Flight {
	id: string;
	airline: string;
	flightNumber: string;
	city: string;
	airportCode: string;
	gate: string;
	/** Scheduled departure, epoch ms. Never moves. */
	scheduledAt: number;
	/** Estimated departure, epoch ms. Moves with delays. */
	departsAt: number;
	status: FlightStatus;
	/** Latest operational note from the server, e.g. a gate change. */
	remark?: string;
	/** Epoch ms of the last server update applied on the client. */
	updatedAt?: number;
}

export type FlightUpdate = Pick<Flight, 'id'> & Partial<Omit<Flight, 'id'>>;
