import { PostHogProvider } from "@posthog/react";
import { getRouteApi, useRouterState } from "@tanstack/react-router";
import type { PostHogConfig } from "posthog-js";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Metric } from "web-vitals";
import {
	buildUserProperties,
	isObservabilityEnabled,
} from "@/lib/observability-shared";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useObservability } from "@/lib/use-observability";

const rootRoute = getRouteApi("__root__");

type PostHogOptions = Partial<PostHogConfig> & {
	__add_tracing_headers?: string[];
};

type BeforeInstallPromptEvent = Event & {
	platforms?: string[];
	prompt?: () => Promise<void>;
	userChoice?: Promise<{
		outcome: "accepted" | "dismissed";
		platform: string;
	}>;
};

type NavigatorWithStandalone = Navigator & {
	standalone?: boolean;
};

type IdentifiedUserSnapshot = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
};

function getDisplayMode() {
	if (typeof window === "undefined") {
		return "unknown";
	}

	if (window.matchMedia("(display-mode: standalone)").matches) {
		return "standalone";
	}

	if (window.matchMedia("(display-mode: fullscreen)").matches) {
		return "fullscreen";
	}

	if (window.matchMedia("(display-mode: minimal-ui)").matches) {
		return "minimal-ui";
	}

	if (window.matchMedia("(display-mode: window-controls-overlay)").matches) {
		return "window-controls-overlay";
	}

	if ((navigator as NavigatorWithStandalone).standalone) {
		return "ios-standalone";
	}

	return "browser";
}

function toIdentifiedUserSnapshot(
	user: NonNullable<ReturnType<typeof useActiveSessionUser>["activeUser"]>,
): IdentifiedUserSnapshot {
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		image: user.image,
	};
}

function isSameIdentifiedUser(
	left: IdentifiedUserSnapshot | null,
	right: IdentifiedUserSnapshot,
) {
	return (
		left?.id === right.id &&
		left.name === right.name &&
		left.email === right.email &&
		left.image === right.image
	);
}

export function ObservabilityProvider({ children }: { children: ReactNode }) {
	const rootData = rootRoute.useLoaderData();
	const config = rootData.observability;
	const { activeUser } = useActiveSessionUser(rootData.sessionUser);
	const activeUserRef = useRef(activeUser);
	activeUserRef.current = activeUser;
	const [isClientReady, setIsClientReady] = useState(false);

	const options = useMemo<PostHogOptions | null>(() => {
		if (!isObservabilityEnabled(config)) {
			return null;
		}

		const tracingHosts =
			typeof window === "undefined" ? undefined : [window.location.hostname];
		const apiHost = config.posthogProxyPath ?? config.posthogHost;

		return {
			__add_tracing_headers: tracingHosts,
			api_host: apiHost,
			capture_exceptions: {
				capture_console_errors: false,
				capture_unhandled_errors: true,
				capture_unhandled_rejections: true,
			},
			capture_pageleave: true,
			capture_pageview: false,
			defaults: "2026-01-30",
			person_profiles: "identified_only",
			ui_host: config.posthogUIHost,
			loaded(posthog) {
				const user = activeUserRef.current;
				if (user) {
					const properties = buildUserProperties(user);
					posthog.identify(user.id, properties);
					posthog.setPersonPropertiesForFlags(properties);
				}
				setIsClientReady(true);
			},
		};
	}, [config]);

	if (!isObservabilityEnabled(config) || !options) {
		return <>{children}</>;
	}

	return (
		<PostHogProvider apiKey={config.posthogKey ?? ""} options={options}>
			<ObservabilityRuntime
				activeUser={activeUser}
				isClientReady={isClientReady}
			/>
			{children}
		</PostHogProvider>
	);
}

function ObservabilityRuntime({
	activeUser,
	isClientReady,
}: {
	activeUser: ReturnType<typeof useActiveSessionUser>["activeUser"];
	isClientReady: boolean;
}) {
	const location = useRouterState({
		select: (state) => state.location,
	});
	const lastIdentifiedUserRef = useRef<IdentifiedUserSnapshot | null>(null);
	const { captureEvent, identifyUser, resetUser, toWebVitalProperties } =
		useObservability();

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const displayMode = getDisplayMode();
		captureEvent("$pageview", {
			$current_url: window.location.href,
			display_mode: displayMode,
			is_standalone: displayMode !== "browser",
			pathname: location.pathname,
			search: location.searchStr,
			title: document.title,
		});
	}, [captureEvent, location.pathname, location.searchStr]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const displayMode = getDisplayMode();
		if (displayMode === "browser") {
			return;
		}

		captureEvent("pwa_launched", {
			display_mode: displayMode,
			pathname: window.location.pathname,
			referrer: document.referrer || null,
		});
	}, [captureEvent]);

	useEffect(() => {
		if (!isClientReady) {
			return;
		}

		if (activeUser) {
			const snapshot = toIdentifiedUserSnapshot(activeUser);
			if (isSameIdentifiedUser(lastIdentifiedUserRef.current, snapshot)) {
				return;
			}
			lastIdentifiedUserRef.current = snapshot;
			identifyUser(activeUser);
			return;
		}

		if (lastIdentifiedUserRef.current) {
			lastIdentifiedUserRef.current = null;
			resetUser();
		}
	}, [activeUser, identifyUser, isClientReady, resetUser]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const onBeforeInstallPrompt = (event: Event) => {
			const installEvent = event as BeforeInstallPromptEvent;

			captureEvent("pwa_install_prompt_available", {
				display_mode: getDisplayMode(),
				pathname: window.location.pathname,
				platforms: installEvent.platforms ?? [],
			});

			void installEvent.userChoice
				?.then((choice) => {
					captureEvent("pwa_install_prompt_choice", {
						display_mode: getDisplayMode(),
						outcome: choice.outcome,
						pathname: window.location.pathname,
						platform: choice.platform,
					});
				})
				.catch(() => {});
		};

		const onAppInstalled = () => {
			captureEvent("pwa_installed", {
				display_mode: getDisplayMode(),
				pathname: window.location.pathname,
			});
		};

		window.addEventListener(
			"beforeinstallprompt",
			onBeforeInstallPrompt as EventListener,
		);
		window.addEventListener("appinstalled", onAppInstalled);

		return () => {
			window.removeEventListener(
				"beforeinstallprompt",
				onBeforeInstallPrompt as EventListener,
			);
			window.removeEventListener("appinstalled", onAppInstalled);
		};
	}, [captureEvent]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		let cancelled = false;

		void import("web-vitals").then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
			if (cancelled) {
				return;
			}

			const reportMetric = (metric: Metric) => {
				captureEvent("web_vital", toWebVitalProperties(metric));
			};

			onCLS(reportMetric);
			onFCP(reportMetric);
			onINP(reportMetric);
			onLCP(reportMetric);
			onTTFB(reportMetric);
		});

		return () => {
			cancelled = true;
		};
	}, [captureEvent, toWebVitalProperties]);

	return null;
}
