import type { PageServerLoad } from './$types';
import { checkLock } from '$lib/server/authLimiter';
import { optionGrids, puzzleAt, randomPuzzleIndex } from '$lib/server/puzzles';
import {
	ATTEMPT_COOKIE,
	ATTEMPT_MAX_AGE_MS,
	cookieOptions,
	issueAttempt,
	readAttempt
} from '$lib/server/session';

export const load: PageServerLoad = async ({ cookies, getClientAddress }) => {
	const lock = checkLock(getClientAddress());

	// Resume an attempt in progress, so a reload doesn't undo a correct first
	// pick. A wrong answer clears the cookie, which is what makes the next load
	// deal a brand new puzzle instead of the one just failed.
	const existing = readAttempt(cookies.get(ATTEMPT_COOKIE));
	const resumed = existing && puzzleAt(existing.puzzleIndex) ? existing : null;

	const index = resumed ? resumed.puzzleIndex : randomPuzzleIndex();
	const phase = resumed ? resumed.phase : 1;
	const puzzle = puzzleAt(index)!;

	if (!resumed) {
		cookies.set(ATTEMPT_COOKIE, issueAttempt(index, 1), cookieOptions(ATTEMPT_MAX_AGE_MS));
	}

	// Only the prompt and the grids cross the wire — never the answer.
	return { ...lock, prompt: puzzle.prompt, phase, ...optionGrids() };
};
