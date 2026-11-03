/**
 * Shared request helpers for /api/* route handlers: auth+DB gate, body validation, responses.
 */
import { error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { z } from "zod";
import { getDatabase, type Database } from "./db";
import { env } from "cloudflare:workers";

export interface ApiContext {
	db: Database;
	userId: string;
}

/**
 * Gate for every authenticated API route. @returns the per-request Drizzle instance + userId.
 * @throws 401 if no authenticated user; @throws 503 if the D1 binding is absent (e.g. plain
 * Vite dev without Wrangler). All data must be scoped to the returned userId.
 */
export const requireApiContext = (event: RequestEvent): ApiContext => {
	const userId = event.locals.user?.id;
	if (!userId) {
		throw error(401, "Unauthorized");
	}

	const d1 = env.DB;
	if (!d1) {
		throw error(503, "Database unavailable");
	}

	return { db: getDatabase(d1), userId };
};

/**
 * Parses and Zod-validates a JSON request body. @throws 400 on malformed JSON or schema
 * failure (the error message is the first Zod issue's message, surfaced to the client).
 */
export const parseJson = async <T extends z.ZodTypeAny>(
	event: RequestEvent,
	schema: T
): Promise<z.infer<T>> => {
	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		throw error(400, "Invalid JSON body");
	}
	const result = schema.safeParse(raw);
	if (!result.success) {
		throw error(400, result.error.issues[0]?.message ?? "Invalid request body");
	}
	return result.data;
};

/** Standard success response: 204 (empty body) when data is omitted, else 200 JSON. */
export const ok = <T>(data?: T) =>
	data === undefined ? new Response(null, { status: 204 }) : Response.json(data);
