import { createBrowserHistory, createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { RouterErrorComponent } from "@/components/router-error";
import { getBundleRecovery } from "@/lib/bundle-recovery";
import { withGameHistory } from "@/lib/game-history";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
export const getRouter = () => {
	const rqContext = TanstackQuery.getContext();

	const router = createRouter({
		routeTree,
		history:
			typeof window === "undefined"
				? undefined
				: withGameHistory(createBrowserHistory()),
		context: {
			...rqContext,
		},

		defaultErrorComponent: RouterErrorComponent,
		defaultPreload: "intent",
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient: rqContext.queryClient,
	});

	if (typeof window !== "undefined") {
		getBundleRecovery().watchRouter(router);
	}

	return router;
};
