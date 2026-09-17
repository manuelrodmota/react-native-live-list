const pad = (value: number) => String(value).padStart(2, '0');

export function formatClock(ms: number): string {
	const date = new Date(ms);
	return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatTime(ms: number): string {
	const date = new Date(ms);
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const formatSeconds = (totalSeconds: number) =>
	`${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
