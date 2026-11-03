// Narrows a Better Auth user object down to the app's CurrentUser shape (name +
// email only); returns null for the unauthenticated case so callers branch once.
import type { CurrentUser } from "#lib/types.js";

export const getCurrentUser = (
	user: { name: string; email: string } | null | undefined
): CurrentUser | null => {
	if (!user) return null;
	return { name: user.name, email: user.email };
};
