/**
 * Tiny in-memory TTL cache with request coalescing.
 *
 * Two jobs, both aimed at keeping TMDB traffic down:
 *  - `get` returns a cached value until it expires.
 *  - concurrent misses for the same key share one upstream request, so a
 *    burst of keystrokes or a double-clicked Compare button is still 1 call.
 *
 * Entries are evicted oldest-first once `maxEntries` is exceeded (Map keeps
 * insertion order, and a read re-inserts, giving us an approximate LRU).
 */
export class TtlCache<T> {
	#entries = new Map<string, { value: T; expiresAt: number }>();
	#inFlight = new Map<string, Promise<T>>();

	constructor(
		private ttlMs: number,
		private maxEntries: number
	) {}

	async fetch(key: string, load: () => Promise<T>): Promise<T> {
		const hit = this.#entries.get(key);
		if (hit) {
			if (hit.expiresAt > Date.now()) {
				// Refresh recency.
				this.#entries.delete(key);
				this.#entries.set(key, hit);
				return hit.value;
			}
			this.#entries.delete(key);
		}

		const pending = this.#inFlight.get(key);
		if (pending) return pending;

		const promise = load()
			.then((value) => {
				this.#set(key, value);
				return value;
			})
			.finally(() => {
				this.#inFlight.delete(key);
			});

		this.#inFlight.set(key, promise);
		return promise;
	}

	#set(key: string, value: T) {
		this.#entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
		while (this.#entries.size > this.maxEntries) {
			const oldest = this.#entries.keys().next();
			if (oldest.done) break;
			this.#entries.delete(oldest.value);
		}
	}

	get size() {
		return this.#entries.size;
	}
}
