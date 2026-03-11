import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "next-themes";
import Header from "@/components/header";
import { links } from "@/components/meta";
import { ObservabilityProvider } from "@/components/observability";
import { ServiceWorkerRegister } from "@/components/service-worker";
import { ThemeMeta } from "@/components/theme-meta";
import { Toaster } from "@/components/ui/sonner";
import {
	materialThemeCss,
	materialThemeMetaColors,
} from "@/lib/material-theme";
import { getObservabilityConfig } from "@/lib/observability-config";
import { getSessionUser } from "@/lib/puzzle-server-fns";
import appCss from "@/styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	loader: async () => ({
		observability: getObservabilityConfig(),
		sessionUser: await getSessionUser(),
	}),

	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1, viewport-fit=cover",
			},
			{
				title: "Paraules - Joc de Mots Encreuats en Català",
			},
			{
				name: "mobile-web-app-capable",
				content: "yes",
			},
			{
				name: "apple-mobile-web-app-capable",
				content: "yes",
			},
			{
				name: "apple-mobile-web-app-status-bar-style",
				content: "black-translucent",
			},
			{
				name: "color-scheme",
				content: "light dark",
			},
			{
				name: "theme-color",
				content: materialThemeMetaColors.light,
			},
		],
		links: [
			...links,
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	component: RootDocument,
	notFoundComponent: NotFound,
});

function RootDocument() {
	const showDevtools = import.meta.env.DEV;

	return (
		<html lang="ca" suppressHydrationWarning>
			<head>
				<HeadContent />
				<style>{materialThemeCss}</style>
			</head>
			<body className="min-h-svh bg-background text-foreground">
				<ThemeProvider storageKey="paraules-theme" attribute="class">
					<ObservabilityProvider>
						<ThemeMeta />
						<ServiceWorkerRegister />
						<div className="flex min-h-svh flex-col">
							<Header />
							<main className="flex-1">
								<Outlet />
							</main>
						</div>
						<Toaster position="top-center" />
						{showDevtools ? (
							<TanStackDevtools
								config={{
									position: "bottom-left",
									hideUntilHover: true,
								}}
								plugins={[
									{
										name: "Tanstack Router",
										render: <TanStackRouterDevtoolsPanel />,
									},
								]}
							/>
						) : null}
					</ObservabilityProvider>
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}

function NotFound() {
	return (
		<div className="flex h-screen w-screen items-center justify-center">
			<h1 className="text-4xl font-bold">404 - No s'ha trobat la pàgina</h1>
		</div>
	);
}
