import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
		}),
	],
	test: {
		// Cloudflare's WebSocket simulator requires shared storage and one worker.
		isolate: false,
		maxWorkers: 1,
	},
});
