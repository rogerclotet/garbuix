import { getRouteApi, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { Metric } from "web-vitals";
import { authClient } from "@/lib/auth-client";
import {
	captureClientEvent,
	identifyClientUser,
	initializeClientObservability,
	resetClientUser,
	toWebVitalProperties,
} from "@/lib/observability-client";

const rootRoute = getRouteApi("__root__");

export function Observability() {
	const rootData = rootRoute.useLoaderData();
	const session = authClient.useSession();
	const location = useRouterState({
		select: (state) => state.location,
	});
	const activeUser = session.data?.user ?? rootData.sessionUser;
	const config = rootData.observability;
	const lastIdentifiedUserIdRef = useRef<string | null>(null);

	useEffect(() => {
		void initializeClientObservability(config);
	}, [config]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		void captureClientEvent("$pageview", {
			current_url: window.location.href,
			pathname: location.pathname,
			search: location.searchStr,
			title: document.title,
		});
	}, [location.pathname, location.searchStr]);

	useEffect(() => {
		if (activeUser) {
			lastIdentifiedUserIdRef.current = activeUser.id;
			void identifyClientUser(activeUser);
			return;
		}

		if (lastIdentifiedUserIdRef.current) {
			lastIdentifiedUserIdRef.current = null;
			void resetClientUser();
		}
	}, [activeUser]);

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
				void captureClientEvent("web_vital", toWebVitalProperties(metric));
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
	}, []);

	return null;
}
