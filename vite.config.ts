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
	plugins: [tailwindcss(), sveltekit()],
	build: {
		target: "es2022"
	},
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		passWithNoTests: false
	}
});
