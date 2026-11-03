// SvelteKit config. Deploys to Cloudflare Workers via adapter-cloudflare; platformProxy
// (below) emulates the `cloudflare:workers` module — `env` (DB, AI, AI_QUOTA_KV, vars and
// secrets) — from wrangler.jsonc during dev/preview, so server code sees the same bindings
// it gets in production.
import adapter from "@sveltejs/adapter-cloudflare";
import { fileURLToPath } from "node:url";

import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Vite build config. Tailwind v4 is wired CSS-first through @tailwindcss/vite — there is
// no tailwind.config.js; theme tokens live in src/app.css under @theme. The es2022 build
// target matches the Node/Worker runtime floor declared in package.json engines.
//
// `defineConfig` comes from vitest/config so the `test` block is typed. Unit tests cover
// pure logic only (no DOM, network, D1, or Workers bindings), so the node environment
// is enough; the vendored DS contract scripts are plain `node --test` files and stay out
// of the vitest glob.
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// $src → src/ lets route files import src/components/* without relative paths, through
	// Vite's own resolver (SvelteKit 3 deprecated its `alias` option in favour of subpath
	// imports). tsconfig.json mirrors it for types.
	resolve: {
		alias: {
			$src: fileURLToPath(new URL("./src", import.meta.url))
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			// CSRF: allow cross-origin form POSTs from the dev/preview ports and the branded
			// production origin. The same-origin request always passes; these cover Vite dev
			// (5173), Wrangler preview (8787), and the custom domain.
			csrf: {
				trustedOrigins: [
					"http://localhost:5173",
					"http://localhost:8787",
					"https://day-zero.dropoutstudio.co"
				]
			},

			adapter: adapter({
				// Local emulation only. The remote variants need a Cloudflare login, which CI and
				// `vitest` (it boots this plugin) do not have, and the Copilot's inference is the
				// user's own REST account rather than the bound AI namespace anyway.
				platformProxy: { configPath: "wrangler.jsonc", remoteBindings: false },
				routes: { include: ["/*"], exclude: ["<all>"] }
			})
		})
	],
	build: { target: "es2022" },
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		passWithNoTests: false
	}
});
