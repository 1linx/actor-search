import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkLock, clearRecord, recordFail } from '$lib/server/authLimiter';
import { isCorrect, puzzleAt } from '$lib/server/puzzles';
import {
	ATTEMPT_COOKIE,
	ATTEMPT_MAX_AGE_MS,
	SESSION_COOKIE,
	SESSION_MAX_AGE_MS,
	cookieOptions,
	issueAttempt,
	issueSession,
	readAttempt
} from '$lib/server/session';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const ip = getClientAddress();

	const lock = checkLock(ip);
	if (lock.locked) {
		return json({ locked: true, secondsRemaining: lock.secondsRemaining }, { status: 429 });
	}

	const { value } = await request.json().catch(() => ({ value: null }));

	// Which puzzle, and which step, both come from the signed cookie rather than
	// the request body — otherwise step one could simply be skipped.
	const attempt = readAttempt(cookies.get(ATTEMPT_COOKIE));
	const puzzle = attempt && puzzleAt(attempt.puzzleIndex);
	if (!attempt || !puzzle) {
		cookies.delete(ATTEMPT_COOKIE, { path: '/' });
		return json({ ok: false, expired: true }, { status: 400 });
	}

	if (!isCorrect(puzzle, attempt.phase, value)) {
		const result = recordFail(ip);
		// Drop the attempt entirely: the next load deals a different puzzle, so a
		// wrong guess can't be used to eliminate options one at a time.
		cookies.delete(ATTEMPT_COOKIE, { path: '/' });
		return json({ ok: false, ...result });
	}

	if (attempt.phase === 1) {
		cookies.set(
			ATTEMPT_COOKIE,
			issueAttempt(attempt.puzzleIndex, 2),
			cookieOptions(ATTEMPT_MAX_AGE_MS)
		);
		return json({ next: true });
	}

	clearRecord(ip);
	cookies.delete(ATTEMPT_COOKIE, { path: '/' });
	cookies.set(SESSION_COOKIE, issueSession(), cookieOptions(SESSION_MAX_AGE_MS));
	return json({ done: true });
};
