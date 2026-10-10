import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

function getBaseURL() {
	if (typeof window !== "undefined") {
		return window.location.origin;
	}

	return "http://localhost:3000";
}

export const authClient = createAuthClient({
	baseURL: getBaseURL(),
	plugins: [emailOTPClient()],
});
