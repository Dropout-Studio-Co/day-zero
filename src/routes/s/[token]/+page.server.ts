/**
 * Public, UNAUTHENTICATED share view. No auth guard lives here (the wall is only
 * the /login redirect on the home route), so anyone with the token can read the
 * countdown. getByShareToken returns ONLY the safe public projection — no owner,
 * no ids, no sibling countdowns.
 */
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getDatabase } from "#lib/server/db.js";
import { getByShareToken } from "#lib/server/repositories/countdowns.js";
import { env } from "cloudflare:workers";

export const load: PageServerLoad = async ({ params }) => {
	const d1 = env.DB;
	if (!d1) throw error(503, "Database unavailable");

	const countdown = await getByShareToken(getDatabase(d1), params.token);
	if (!countdown) throw error(404, "This countdown isn’t shared (or never existed).");

	return { countdown };
};
