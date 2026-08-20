/**
 * PM2 process definition.
 *
 * Note the .cjs extension: package.json sets `"type": "module"`, so a file named
 * ecosystem.config.js is treated as an ES module, `module.exports` quietly goes
 * nowhere, and PM2 reads an empty config and reports no apps to start.
 */
const os = require('node:os');
const path = require('node:path');

// PM2 does not expand `~`, and the username differs between AMIs (ubuntu on
// Ubuntu, ec2-user on Amazon Linux), so resolve the home directory instead of
// hardcoding either.
const appDir = path.join(os.homedir(), 'actor-search');

module.exports = {
	apps: [
		{
			name: 'actor-search',
			script: './build/index.js',
			cwd: appDir,

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
				PORT: 9090,
				// Listening on all interfaces, so the app is reachable directly at
				// http://<instance>:9090 — the EC2 security group is then the only
				// thing standing in front of it. Change to '127.0.0.1' if you put
				// nginx in front, so nothing but the proxy can reach the port.
				HOST: '0.0.0.0',
				// Public URL, used for url.origin and the CSRF origin check on POSTs.
				// This app only issues same-origin GETs, so it runs correctly even if
				// this is wrong — but set it to the real host and port.
				ORIGIN: 'http://your-instance-hostname:9090'
			},

			// 1 GB of RAM, shared with the OS. The credit cache is entry-capped so this
			// should never fire; if it does, it restarts rather than inviting the OOM
			// killer. A restart empties the cache, so don't set it tight.
			max_memory_restart: '400M',

			autorestart: true,
			// Back off instead of hammering restarts when it can't start at all —
			// a missing .env or an already-bound port would otherwise crash-loop hot.
			exp_backoff_restart_delay: 200,

			time: true,
			out_file: path.join(appDir, 'logs/out.log'),
			error_file: path.join(appDir, 'logs/error.log')
		}
	]
};
