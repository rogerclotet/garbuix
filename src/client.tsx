import "./instrument.client";

import { captureException } from "@sentry/tanstackstart-react";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
		</StrictMode>,
		{
			onRecoverableError: (error) => captureException(error),
			onUncaughtError: (error) =>
				captureException(error, {
					mechanism: { type: "react.onUncaughtError", handled: false },
				}),
		},
	);
});
