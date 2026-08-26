/**
 * Per-IP failure counter and lockout, in process memory.
 *
 * IP is the right key for rate limiting specifically — it's the thing an
 * attacker can't cheaply change — while how far through the puzzle you are
 * lives in the signed attempt cookie, so two people behind one NAT don't
 * interfere with each other's progress.
 */
const LOCK_DURATION_MS = 10 * 60 * 1000;
const MAX_FAILS = 3;
/** Stops the map growing without bound on a public box. */
const MAX_TRACKED_IPS = 5000;

interface Record {
	fails: number;
	lockedUntil: number;
}

const records = new Map<string, Record>();

function get(ip: string): Record {
	let record = records.get(ip);
	if (!record) {
		if (records.size >= MAX_TRACKED_IPS) {
			// Drop the oldest entry; Map preserves insertion order.
			const oldest = records.keys().next();
			if (!oldest.done) records.delete(oldest.value);
		}
		record = { fails: 0, lockedUntil: 0 };
		records.set(ip, record);
	}
	return record;
}

export function checkLock(ip: string): { locked: boolean; secondsRemaining: number } {
	const record = get(ip);
	if (record.lockedUntil > Date.now()) {
		return {
			locked: true,
			secondsRemaining: Math.ceil((record.lockedUntil - Date.now()) / 1000)
		};
	}
	return { locked: false, secondsRemaining: 0 };
}

export function recordFail(ip: string): { locked: boolean; secondsRemaining: number } {
	const record = get(ip);

	// An expired lock resets the count, so a lockout isn't permanent.
	if (record.lockedUntil > 0 && record.lockedUntil <= Date.now()) {
		record.fails = 0;
		record.lockedUntil = 0;
	}

	record.fails += 1;
	if (record.fails >= MAX_FAILS) {
		record.lockedUntil = Date.now() + LOCK_DURATION_MS;
		return { locked: true, secondsRemaining: Math.ceil(LOCK_DURATION_MS / 1000) };
	}
	return { locked: false, secondsRemaining: 0 };
}

export const clearRecord = (ip: string) => records.delete(ip);
