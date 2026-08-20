/**
 * PM2 process definition.
 *
 * Note the .cjs extension: package.json sets `"type": "module"`, so a file named
 * ecosystem.config.js would be loaded as an ES module and PM2 — which requires
 * its config — cannot read it.
 */
module.exports = {
	apps: [
		{
			name: 'actor-search',
			script: './build/index.js',
			cwd: '/srv/actor-search',

			// Node loads .env itself rather than PM2 doing it, which keeps the TMDB
			// key out of `pm2 env`, `pm2 describe`, and the dump file `pm2 save`
			// writes to ~/.pm2/dump.pm2. Requires Node 20.6+; the path is relative
			// to `cwd` above.
			node_args: '--env-file=.env',

			// One process, deliberately — not cluster mode. The TMDB cache in
			// src/lib/server/cache.ts lives in process memory, so each additional
			// worker would keep its own copy and multiply upstream calls by the
			// instance count. A micro instance has 1–2 vCPUs anyway, so there is
			// nothing to gain here.
			exec_mode: 'fork',
			instances: 1,

			env: {
				NODE_ENV: 'production',
				// Bind to loopback only and let nginx terminate TLS in front. Without
				// this, adapter-node listens on 0.0.0.0 and the app is reachable on
				// :3000 directly for anyone the security group lets through.
				HOST: '127.0.0.1',
				PORT: 3000,
				// Public URL. SvelteKit uses it for url.origin and for the CSRF origin
				// check on POSTs. This app only issues same-origin GETs so it would run
				// without it, but set it correctly rather than rely on that.
				ORIGIN: 'https://actor-search.example.com'
			},

			// 1 GB of RAM, shared with nginx and the OS. The credit cache is entry-capped
			// so this should never fire; if it does, it restarts rather than inviting the
			// OOM killer. A restart empties the cache, so don't set it tight.
			max_memory_restart: '400M',

			autorestart: true,
			// Back off instead of hammering restarts when it can't start at all —
			// a missing .env or an already-bound port would otherwise crash-loop hot.
			exp_backoff_restart_delay: 200,

			time: true,
			out_file: '/var/log/actor-search/out.log',
			error_file: '/var/log/actor-search/error.log'
		}
	]
};
