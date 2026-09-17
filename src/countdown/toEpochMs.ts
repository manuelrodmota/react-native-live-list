export type DeadlineInput = number | string | Date | null | undefined;

/**
 * Normalizes a deadline (epoch ms, ISO string or Date) to epoch ms. Returns
 * null for missing or unparseable input.
 */
export function toEpochMs(deadline: DeadlineInput): number | null {
	if (deadline === null || deadline === undefined) return null;
	if (typeof deadline === 'number') {
		return Number.isFinite(deadline) ? deadline : null;
	}
	const ms =
		deadline instanceof Date
			? deadline.getTime()
			: new Date(deadline).getTime();
	return Number.isNaN(ms) ? null : ms;
}
