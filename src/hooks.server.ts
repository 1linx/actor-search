import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, isValidSession } from '$lib/server/session';

/** The only paths reachable without a session. */
const PUBLIC = ['/auth', '/api/auth'];

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (!PUBLIC.includes(path) && !isValidSession(event.cookies.get(SESSION_COOKIE))) {
		// Gating /api/search and /api/compare is the point of this: they spend the
		// TMDB key, so they must not be callable by anyone who found the URL.
		if (path.startsWith('/api/')) {
			return new Response('Unauthorized', { status: 401 });
		}
		redirect(302, '/auth');
	}

	return resolve(event);
};
