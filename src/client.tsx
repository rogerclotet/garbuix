import "./instrument.client";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { captureBrowserException } from "./lib/error-tracking-client";

startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
		</StrictMode>,
		{
			onUncaughtError: (error) => captureBrowserException(error, false),
			onRecoverableError: (error) => captureBrowserException(error),
			onCaughtError: (error) => captureBrowserException(error),
		},
	);
});
