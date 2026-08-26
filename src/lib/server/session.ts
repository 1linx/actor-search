import crypto from 'node:crypto';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

/**
 * Signed cookie values.
 *
 * Both cookies here are HMAC'd rather than being fixed strings. That matters
 * for two different reasons:
 *
 *  - the session cookie decides whether you're in, so a constant value like
 *    "authenticated" would let anyone in who guesses the cookie name;
 *  - the attempt cookie carries which step you've reached, so an unsigned one
 *    would let you skip straight to step two.
 *
 * Set AUTH_SECRET to keep sessions alive across restarts. Without it a random
 * per-process secret is used, which is safe but logs everyone out on deploy.
 */
const SECRET = env.AUTH_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ATTEMPT_TTL_MS = 30 * 60 * 1000;

export const SESSION_COOKIE = 'site_auth';
export const ATTEMPT_COOKIE = 'auth_attempt';

const sign = (payload: string) =>
	crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

function seal(payload: string, ttlMs: number): string {
	const body = `${payload}|${Date.now() + ttlMs}`;
	return `${body}|${sign(body)}`;
}

function unseal(token: string | undefined): string | null {
	if (!token) return null;
	const parts = token.split('|');
	if (parts.length < 3) return null;

	const mac = parts.pop()!;
	const expiresAt = Number(parts.pop());
	const payload = parts.join('|');
	const expected = sign(`${payload}|${expiresAt}`);

	// Compare in constant time, and only once the lengths match — timingSafeEqual
	// throws on a length mismatch rather than returning false.
	if (mac.length !== expected.length) return null;
	if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
	if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

	return payload;
}

export const issueSession = () => seal('ok', SESSION_TTL_MS);
export const isValidSession = (token: string | undefined) => unseal(token) === 'ok';

/**
 * The attempt cookie records which puzzle is being answered and how far in.
 *
 * It stores the puzzle's *index*, never its id: the ids are descriptive
 * ('yellow-submarine'), and although the cookie is httpOnly, its value is still
 * plainly visible in devtools — which would hand over the answer.
 */
export const issueAttempt = (puzzleIndex: number, phase: 1 | 2) =>
	seal(`${puzzleIndex}:${phase}`, ATTEMPT_TTL_MS);

export function readAttempt(
	token: string | undefined
): { puzzleIndex: number; phase: 1 | 2 } | null {
	const payload = unseal(token);
	if (!payload) return null;
	const [index, phase] = payload.split(':');
	if (phase !== '1' && phase !== '2') return null;
	const puzzleIndex = Number(index);
	if (!Number.isInteger(puzzleIndex) || puzzleIndex < 0) return null;
	return { puzzleIndex, phase: phase === '1' ? 1 : 2 };
}

/** Shared cookie options — `secure` is dropped in dev so localhost still works. */
export const cookieOptions = (maxAgeMs: number) => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: !dev,
	maxAge: Math.floor(maxAgeMs / 1000)
});

export const SESSION_MAX_AGE_MS = SESSION_TTL_MS;
export const ATTEMPT_MAX_AGE_MS = ATTEMPT_TTL_MS;
