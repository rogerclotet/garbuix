import { createServerFn } from "@tanstack/react-start";
import { getObservabilityConfig as getPublicConfig } from "@/lib/observability-config";

// Route loaders run in the browser on navigation as well as on the server.
// Return public analytics settings without bundling server environment access.
export const getObservabilityConfig = createServerFn({ method: "GET" }).handler(
	() => getPublicConfig(),
);
