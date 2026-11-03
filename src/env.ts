import { defineEnvVars } from "@sveltejs/kit/env";

// One Tap is optional: PUBLIC_GOOGLE_CLIENT_ID is empty when unset, and the login page
// simply skips the One Tap prompt in that case (the Google button still works).
export const variables = defineEnvVars({
	PUBLIC_GOOGLE_CLIENT_ID: { public: true, schema: (input) => input ?? "" }
});
