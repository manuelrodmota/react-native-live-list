export interface Scheduler {
	start(): void;
	stop(): void;
	isRunning(): boolean;
}

/**
 * Fires `onTick` on wall-clock boundaries of `intervalMs` (for 1000ms: on
 * every whole second of `now()`), re-aligning after each tick so timer drift
 * and suspended JS runtimes never accumulate.
 */
export function createAlignedScheduler(
	intervalMs: number,
	now: () => number,
	onTick: (now: number) => void,
): Scheduler {
	if (!(intervalMs > 0) || !Number.isFinite(intervalMs)) {
		throw new RangeError(
			`react-native-live-list: intervalMs must be a positive number, received ${intervalMs}`,
		);
	}

	let running = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let lastBoundary = -Infinity;

	const schedule = () => {
		const current = now();
		let next = (Math.floor(current / intervalMs) + 1) * intervalMs;
		if (next <= lastBoundary) next = lastBoundary + intervalMs;
		lastBoundary = next;
		timer = setTimeout(fire, Math.max(0, next - current));
	};

	const fire = () => {
		timer = null;
		onTick(now());
		if (running && timer === null) schedule();
	};

	return {
		start() {
			if (running) return;
			running = true;
			lastBoundary = -Infinity;
			schedule();
		},
		stop() {
			running = false;
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
		},
		isRunning: () => running,
	};
}
