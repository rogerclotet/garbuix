declare const __APP_VERSION__: string;
declare const __APP_SERVICE_WORKER_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;

// Changes only when the service worker or its precache does, which is the only
// kind of release a running client has to be interrupted for.
export const APP_SERVICE_WORKER_VERSION = __APP_SERVICE_WORKER_VERSION__;
