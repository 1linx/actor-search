import { env } from '$env/dynamic/private';
import { TtlCache } from './cache';
import type {
	CompareResult,
	MediaType,
	RoleInTitle,
	SharedPerson,
	TitleSuggestion,
	TitleSummary
} from '$lib/types';

const BASE = 'https://api.themoviedb.org/3';

/** Titles change rarely, but searches are cheap to redo; an hour is plenty. */
const searchCache = new TtlCache<TitleSuggestion[]>(60 * 60 * 1000, 500);
/** Credits for a released film or an aired series are near enough immutable. */
const creditsCache = new TtlCache<TitleCredits>(24 * 60 * 60 * 1000, 300);

export class TmdbError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

type Credentials = { bearer: string } | { apiKey: string };

/**
 * TMDB accepts either a v3 API key (32 hex chars, as a query param) or a v4
 * read access token (a JWT, as a Bearer header). Work out which we were given
 * so either value in TMDB_API_KEY just works.
 */
function credentials(): Credentials {
	const raw = (env.TMDB_READ_ACCESS_TOKEN || env.TMDB_API_KEY || '').trim();
	if (!raw) {
		throw new TmdbError('TMDB_API_KEY is not set. Copy .env.example to .env and add your key.', 500);
	}
	return raw.split('.').length === 3 ? { bearer: raw } : { apiKey: raw };
}

async function request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
	const creds = credentials();
	const url = new URL(BASE + path);
	url.searchParams.set('language', 'en-US');
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	if ('apiKey' in creds) url.searchParams.set('api_key', creds.apiKey);

	const res = await fetch(url, {
		headers: {
			accept: 'application/json',
			...('bearer' in creds ? { authorization: `Bearer ${creds.bearer}` } : {})
		}
	});

	if (!res.ok) {
		const detail = await res
			.json()
			.then((body) => (body as { status_message?: string }).status_message)
			.catch(() => null);
		throw new TmdbError(detail ?? `TMDB request failed (${res.status})`, res.status);
	}

	return res.json() as Promise<T>;
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

interface TmdbMultiResult {
	id: number;
	media_type?: string;
	title?: string;
	name?: string;
	release_date?: string;
	first_air_date?: string;
	poster_path?: string | null;
}

const year = (date?: string) => (date ? date.slice(0, 4) : null) || null;

/** Films and shows use different field names for the same two things. */
function normaliseTitle(raw: TmdbMultiResult, mediaType: MediaType): TitleSuggestion {
	return {
		id: raw.id,
		mediaType,
		title: (mediaType === 'movie' ? raw.title : raw.name) ?? 'Untitled',
		year: year(mediaType === 'movie' ? raw.release_date : raw.first_air_date),
		posterPath: raw.poster_path ?? null
	};
}

/**
 * One `/search/multi` call covers films and shows together, which beats
 * querying `/search/movie` and `/search/tv` separately. It also returns
 * people, which we drop.
 */
export function searchTitles(query: string, limit = 8): Promise<TitleSuggestion[]> {
	const normalised = query.trim().toLowerCase();
	return searchCache.fetch(`${normalised}::${limit}`, async () => {
		const data = await request<{ results?: TmdbMultiResult[] }>('/search/multi', {
			query: normalised,
			include_adult: 'false',
			page: '1'
		});
		return (data.results ?? [])
			.filter((r): r is TmdbMultiResult & { media_type: MediaType } =>
				r.media_type === 'movie' || r.media_type === 'tv'
			)
			.slice(0, limit)
			.map((r) => normaliseTitle(r, r.media_type));
	});
}

/* -------------------------------------------------------------------------- */
/* Credits                                                                    */
/* -------------------------------------------------------------------------- */

/** One person's credit on one title, in a shape shared by films and shows. */
interface PersonCredit {
	name: string;
	profilePath: string | null;
	role: RoleInTitle;
}

interface TitleCredits {
	summary: TitleSummary;
	cast: Map<number, PersonCredit>;
	crew: Map<number, PersonCredit>;
}

interface TmdbMovieCredit {
	id: number;
	name: string;
	profile_path?: string | null;
	character?: string;
	job?: string;
	order?: number;
}

/** Aggregate TV credits nest the roles, since a person can recur or double up. */
interface TmdbTvCredit {
	id: number;
	name: string;
	profile_path?: string | null;
	roles?: Array<{ character?: string; episode_count?: number }>;
	jobs?: Array<{ job?: string; episode_count?: number }>;
	total_episode_count?: number;
	order?: number;
}

/** Merge repeat credits for one person on one title into a single entry. */
function addCredit(
	into: Map<number, PersonCredit>,
	id: number,
	name: string,
	profilePath: string | null,
	roles: string[],
	order: number | null,
	episodeCount: number | null
) {
	const existing = into.get(id);
	if (!existing) {
		into.set(id, {
			name,
			profilePath,
			role: { roles: roles.filter(Boolean), order, episodeCount }
		});
		return;
	}
	for (const role of roles) {
		if (role && !existing.role.roles.includes(role)) existing.role.roles.push(role);
	}
	if (order !== null) {
		existing.role.order = existing.role.order === null ? order : Math.min(existing.role.order, order);
	}
	if (episodeCount !== null) {
		existing.role.episodeCount = (existing.role.episodeCount ?? 0) + episodeCount;
	}
}

function movieCredits(raw: {
	credits?: { cast?: TmdbMovieCredit[]; crew?: TmdbMovieCredit[] };
}): Pick<TitleCredits, 'cast' | 'crew'> {
	const build = (list: TmdbMovieCredit[], label: (c: TmdbMovieCredit) => string) => {
		const out = new Map<number, PersonCredit>();
		for (const c of list) {
			// Films have no episodes, so episodeCount stays null.
			addCredit(out, c.id, c.name, c.profile_path ?? null, [label(c).trim()], c.order ?? null, null);
		}
		return out;
	};
	return {
		cast: build(raw.credits?.cast ?? [], (c) => c.character ?? ''),
		crew: build(raw.credits?.crew ?? [], (c) => c.job ?? '')
	};
}

function tvCredits(raw: {
	aggregate_credits?: { cast?: TmdbTvCredit[]; crew?: TmdbTvCredit[] };
}): Pick<TitleCredits, 'cast' | 'crew'> {
	const build = (list: TmdbTvCredit[], kind: 'cast' | 'crew') => {
		const out = new Map<number, PersonCredit>();
		for (const c of list) {
			const entries = (kind === 'cast' ? c.roles : c.jobs) ?? [];
			const labels = entries
				.map((e) => (kind === 'cast' ? (e as { character?: string }).character : (e as { job?: string }).job) ?? '')
				.map((s) => s.trim());
			const episodes =
				c.total_episode_count ?? entries.reduce((sum, e) => sum + (e.episode_count ?? 0), 0);
			addCredit(out, c.id, c.name, c.profile_path ?? null, labels, c.order ?? null, episodes || null);
		}
		return out;
	};
	return {
		cast: build(raw.aggregate_credits?.cast ?? [], 'cast'),
		crew: build(raw.aggregate_credits?.crew ?? [], 'crew')
	};
}

/**
 * Fetch a title's details and full credits in one request.
 *
 * Films use `credits`; shows use `aggregate_credits`, which covers the whole
 * run rather than only the latest season — one-episode guest spots are exactly
 * the sort of half-remembered face this app exists to identify.
 *
 * Only the collapsed maps are cached, never the raw response: aggregate credits
 * for a long-running series run to hundreds of people and we need six fields.
 */
function getCredits(mediaType: MediaType, id: number): Promise<TitleCredits> {
	return creditsCache.fetch(`${mediaType}:${id}`, async () => {
		if (mediaType === 'movie') {
			const raw = await request<
				TmdbMultiResult & { credits?: { cast?: TmdbMovieCredit[]; crew?: TmdbMovieCredit[] } }
			>(`/movie/${id}`, { append_to_response: 'credits' });
			return { summary: normaliseTitle(raw, 'movie'), ...movieCredits(raw) };
		}
		const raw = await request<
			TmdbMultiResult & {
				aggregate_credits?: { cast?: TmdbTvCredit[]; crew?: TmdbTvCredit[] };
			}
		>(`/tv/${id}`, { append_to_response: 'aggregate_credits' });
		return { summary: normaliseTitle(raw, 'tv'), ...tvCredits(raw) };
	});
}

/* -------------------------------------------------------------------------- */
/* Compare                                                                    */
/* -------------------------------------------------------------------------- */

function intersect(
	a: Map<number, PersonCredit>,
	b: Map<number, PersonCredit>
): SharedPerson[] {
	const shared: SharedPerson[] = [];
	// Walk the smaller map so the intersection stays O(min(a, b)).
	const [small, large, flipped] = a.size <= b.size ? [a, b, false] : [b, a, true];
	for (const [id, entry] of small) {
		const match = large.get(id);
		if (!match) continue;
		const [inA, inB] = flipped ? [match.role, entry.role] : [entry.role, match.role];
		shared.push({
			id,
			name: entry.name,
			profilePath: entry.profilePath ?? match.profilePath,
			inA,
			inB
		});
	}
	// Rank on the *better* of the two billings, not the sum: someone top-billed
	// in one title and a bit-part in the other is still the face you recognise,
	// and summing would bury them under two evenly-obscure extras.
	const best = (p: SharedPerson) => Math.min(p.inA.order ?? 999, p.inB.order ?? 999);
	const total = (p: SharedPerson) => (p.inA.order ?? 999) + (p.inB.order ?? 999);
	return shared.sort(
		(x, y) => best(x) - best(y) || total(x) - total(y) || x.name.localeCompare(y.name)
	);
}

export async function compareTitles(
	a: { mediaType: MediaType; id: number },
	b: { mediaType: MediaType; id: number }
): Promise<CompareResult> {
	const [first, second] = await Promise.all([
		getCredits(a.mediaType, a.id),
		getCredits(b.mediaType, b.id)
	]);

	return {
		a: first.summary,
		b: second.summary,
		cast: intersect(first.cast, second.cast),
		crew: intersect(first.crew, second.crew)
	};
}
