# Actor Search

Pick two films or TV shows, get every actor (or crew member) who appears in both. "Where do
I know them from?" — answered.

Built with SvelteKit (Node adapter), Svelte 5, Tailwind 4 and the TMDB API.

## Setup

```bash
npm install
cp .env.example .env   # then paste your key in
npm run dev
```

TMDB gives you two credentials on <https://www.themoviedb.org/settings/api>. Either works:

| Credential                            | Env var                    |
| ------------------------------------- | -------------------------- |
| **API Key** (short hex string, v3)    | `TMDB_API_KEY`             |
| **API Read Access Token** (JWT, v4)   | `TMDB_READ_ACCESS_TOKEN`   |

The key is only ever read on the server (`$env/dynamic/private`) and never reaches the
browser — the client talks to this app's own `/api/*` routes.

## Production

```bash
npm run build
TMDB_API_KEY=... node build
```

## How it works

Two endpoints, both server-side proxies over TMDB:

- `GET /api/search?q=paul` → up to 8 suggestions, films and shows mixed, each tagged with
  its `mediaType`.
- `GET /api/compare?a=movie:39513&b=tv:1396` → both titles plus the shared `cast` and
  `crew`. Either side can be a film or a show, so film/film, film/TV and TV/TV all work.

Films and shows disagree about field names (`title`/`release_date` vs `name`/`first_air_date`)
and about credit shape, so both are normalised to one internal form before comparison. TV
credits come from **`aggregate_credits`**, which covers the entire run rather than only the
latest season — a one-episode guest spot is exactly the sort of half-remembered face this
app exists to identify, and each role carries its episode count so you can tell a series
regular from a walk-on.

The comparison itself is a hash-map intersection on TMDB's person `id`, walking whichever
cast list is shorter. Multiple credits for one person on one title (voice + on-screen, or a
character who gets renamed mid-series) collapse into a single entry listing both roles.
Results rank on the *better* of the two billing positions rather than the sum, so someone
top-billed in one title and uncredited in the other still leads — which is usually exactly
who you were trying to place.

## Keeping TMDB traffic down

The API has generous limits, but nothing here hits it more than it has to:

- **One request per title, not two.** `append_to_response` folds the credits into the
  details call (`/movie/{id}?append_to_response=credits`,
  `/tv/{id}?append_to_response=aggregate_credits`), so a comparison costs exactly
  **2 requests** — and 0 if either title has been looked at recently.
- **One search call, not two.** `/search/multi` covers films and shows together; person
  results are discarded server-side.
- **Server-side cache** (`src/lib/server/cache.ts`): credits for 24h, searches for 1h,
  size-capped and evicted oldest-first. Only the collapsed per-person maps are cached, not
  the raw upstream JSON — aggregate credits for a long-running series run to hundreds of
  people and six fields each are all we need.
- **Request coalescing.** Concurrent misses for the same key share one upstream request, so
  a double-clicked comparison or two users typing the same title is still one call.
- **Debounced typing** — 300ms, minimum 2 characters, so "civil war" is one request rather
  than nine.
- **Client-side query cache + abort.** Backspacing and re-typing replays local results;
  superseded requests are aborted and their responses discarded.
- **Browser caching** via `cache-control` on both endpoints.
- Posters and headshots come from TMDB's image CDN (`image.tmdb.org`), which doesn't count
  against the API at all.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
