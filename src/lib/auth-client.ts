// Browser-side Better Auth client. Empty base config = same-origin baseURL inferred
// from the page. Google OAuth is the only sign-in method (email/password is disabled
// server-side in createAuth); One Tap + passkeys layer on top via the plugins below.
import { createAuthClient } from "better-auth/svelte";
import { oneTapClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { PUBLIC_GOOGLE_CLIENT_ID } from "$app/env/public";

// Browser-exposed Google OAuth client id (non-secret) for One Tap. Empty where it isn't
// configured → One Tap is simply never triggered (the login page guards on this value).
const googleClientId = PUBLIC_GOOGLE_CLIENT_ID ?? "";

export const authClient = createAuthClient({
	plugins: [
		// Passkey / WebAuthn — device biometrics (Face ID / Touch ID / fingerprint) + security keys.
		passkeyClient(),
		// Google One Tap. Initialized with the public client id; harmless when empty since the
		// prompt is only ever triggered explicitly from the login page.
		oneTapClient({
			clientId: googleClientId,
			autoSelect: false,
			cancelOnTapOutside: true,
			context: "signin",
			promptOptions: { baseDelay: 1000, maxAttempts: 3 }
		})
	]
});

export const { signIn, signOut, useSession } = authClient;
