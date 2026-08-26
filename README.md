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

## Auth

The whole site sits behind a two-step film-trivia gate ([hooks.server.ts](src/hooks.server.ts)):
you get a title with a colour and a noun blanked out, pick the colour from a swatch grid,
then the noun from a symbol grid. `The Hunt for ___ ___` wants **Red**, then **October**.

**Adding a puzzle is one entry** in `PUZZLES` in
[src/lib/server/puzzles.ts](src/lib/server/puzzles.ts):

```ts
{ id: 'red-dragon', prompt: 'Hannibal, pre-Hopkins: ___ ___', colour: 'red', word: 'Dragon', symbol: '🐉' }
```

Nothing else needs touching. The word and its symbol join the step-two grid automatically,
which also makes every new entry a decoy for all the others. `colour` is typed against the
`COLOURS` palette, so a typo is a compile error rather than a blank swatch.

Write prompts that identify the film from what's left — `The ___ ___` could be half a dozen
titles, whereas `Hanks on death row: The ___ ___` only goes one way.

### What protects what

- **Answers never leave the server.** The puzzle table lives under `$lib/server`, and the
  page is sent only the prompt plus the two option grids. Those grids are identical for
  every puzzle, so they give nothing away either.
- **Both cookies are HMAC-signed** ([session.ts](src/lib/server/session.ts)). The session
  cookie has to be, or anyone could set `site_auth=authenticated` by hand. The attempt
  cookie has to be, or step one could be skipped by editing the phase — and it stores the
  puzzle's *index* rather than its id, because `auth_attempt=yellow-submarine:1` would be
  visible in devtools and would give away the answer.
- **A wrong answer deals a new puzzle**, so options can't be eliminated one at a time.
- **Three wrong answers locks the IP for 10 minutes** ([authLimiter.ts](src/lib/server/authLimiter.ts)).
  A correct answer during a lockout is still refused.
- `/api/search` and `/api/compare` return **401** rather than redirecting — they spend the
  TMDB key, so sealing them is the real point of the gate.

Set `AUTH_SECRET` in `.env` on the server (`openssl rand -hex 32`). Without it a random
secret is generated per process, which is safe but signs everyone out on every restart.

This is a soft gate: anyone who knows the films can walk through it, by design. It keeps
bots and randoms off the TMDB key — it is not a login.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
