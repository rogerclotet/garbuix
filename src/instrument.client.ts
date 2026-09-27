import * as Sentry from "@sentry/tanstackstart-react";
import { APP_VERSION } from "@/lib/app-version";
import {
	GLITCHTIP_CONFIG_ID,
	GLITCHTIP_TUNNEL_PATH,
	glitchtipClientConfigSchema,
} from "@/lib/glitchtip-config";
import { scrubGlitchTipEvent } from "@/lib/glitchtip-scrub";

const serialized = document.getElementById(GLITCHTIP_CONFIG_ID)?.textContent;
const config = glitchtipClientConfigSchema.safeParse(
	serialized ? JSON.parse(serialized) : null,
);

if (config.success) {
	Sentry.init({
		...config.data,
		release: `garbuix@${APP_VERSION}`,
		tunnel: GLITCHTIP_TUNNEL_PATH,
		sendClientReports: false,
		sendDefaultPii: false,
		beforeSend: scrubGlitchTipEvent,
		beforeSendTransaction: scrubGlitchTipEvent,
		integrations: (defaults) => [
			...defaults.filter(
				(integration) => integration.name !== "BrowserSession",
			),
			...(config.data.enableLogs
				? [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })]
				: []),
		],
		initialScope: { tags: { runtime: "browser" } },
	});
}
