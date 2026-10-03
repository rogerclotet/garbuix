import { existsSync, readFileSync } from "node:fs";
import * as Sentry from "@sentry/tanstackstart-react";
import { sentryPrivacyOptions } from "./sentry-privacy.ts";

// The production build copies its manifest beside this preload module.
const manifestUrl = new URL("./version.json", import.meta.url);
const release = existsSync(manifestUrl)
	? JSON.parse(readFileSync(manifestUrl, "utf8")).sentryRelease
	: undefined;

Sentry.init({
	dsn: process.env.SENTRY_DSN || undefined,
	enabled: Boolean(process.env.SENTRY_DSN),
	environment: process.env.NODE_ENV ?? "development",
	release,
	...sentryPrivacyOptions,
});
