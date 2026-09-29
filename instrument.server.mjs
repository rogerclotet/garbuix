import * as Sentry from "@sentry/tanstackstart-react";
import { sentryPrivacyOptions } from "./sentry-privacy.ts";

Sentry.init({
	dsn: "https://4baeb18080b08bcb9089563ce2183016@o4507313162485760.ingest.de.sentry.io/4512166638190672",
	environment: process.env.NODE_ENV ?? "development",
	...sentryPrivacyOptions,
});
