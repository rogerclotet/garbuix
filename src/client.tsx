import "./instrument.client";

import { captureException } from "@sentry/tanstackstart-react";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { getBundleRecovery } from "./lib/bundle-recovery";

startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
		</StrictMode>,
		{
			onRecoverableError: (error) => captureException(error),
			onUncaughtError: (error) => {
				getBundleRecovery().failed();
				captureException(error, {
					mechanism: { type: "react.onUncaughtError", handled: false },
				});
			},
		},
	);
});
