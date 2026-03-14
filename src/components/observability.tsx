import { PostHogProvider } from "@posthog/react";
import { getRouteApi, useRouterState } from "@tanstack/react-router";
import type { PostHogConfig } from "posthog-js";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import type { Metric } from "web-vitals";
import { isObservabilityEnabled } from "@/lib/observability-shared";
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

export function ObservabilityProvider({ children }: { children: ReactNode }) {
	const rootData = rootRoute.useLoaderData();
	const config = rootData.observability;

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
		};
	}, [config]);

	if (!isObservabilityEnabled(config) || !options) {
		return <>{children}</>;
	}

	return (
		<PostHogProvider apiKey={config.posthogKey ?? ""} options={options}>
			<ObservabilityRuntime />
			{children}
		</PostHogProvider>
	);
}

function ObservabilityRuntime() {
	const rootData = rootRoute.useLoaderData();
	const location = useRouterState({
		select: (state) => state.location,
	});
	const { activeUser } = useActiveSessionUser(rootData.sessionUser);
	const lastIdentifiedUserIdRef = useRef<string | null>(null);
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
		if (activeUser) {
			lastIdentifiedUserIdRef.current = activeUser.id;
			identifyUser(activeUser);
			return;
		}

		if (lastIdentifiedUserIdRef.current) {
			lastIdentifiedUserIdRef.current = null;
			resetUser();
		}
	}, [activeUser, identifyUser, resetUser]);

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
