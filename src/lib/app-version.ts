declare const __APP_VERSION__: string;
declare const __APP_SERVICE_WORKER_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;

// Changes only when the service worker or its precache does. Missing route
// bundles from ordinary releases are recovered by RouterErrorComponent.
export const APP_SERVICE_WORKER_VERSION = __APP_SERVICE_WORKER_VERSION__;
