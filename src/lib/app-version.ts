declare const __APP_SERVICE_WORKER_VERSION__: string;
declare const __SENTRY_RELEASE__: string | undefined;

export const APP_RELEASE = __SENTRY_RELEASE__ ?? "dev";

// Changes only when the service worker or its precache does. Missing route
// bundles are recovered by RouterErrorComponent; app releases refresh on resume.
export const APP_SERVICE_WORKER_VERSION = __APP_SERVICE_WORKER_VERSION__;
