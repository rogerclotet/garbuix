import * as Sentry from "@sentry/tanstackstart-react";
import { sentryPrivacyOptions } from "../sentry-privacy.ts";
import { env } from "./env";
import { getBundleRecovery } from "./lib/bundle-recovery";

declare const __SENTRY_RELEASE__: string | undefined;

Sentry.init({
	dsn: env.VITE_SENTRY_DSN,
	enabled: Boolean(env.VITE_SENTRY_DSN),
	environment: import.meta.env.MODE,
	release: __SENTRY_RELEASE__,
	...sentryPrivacyOptions,
});

window.addEventListener("pagehide", getBundleRecovery().pageHide);
