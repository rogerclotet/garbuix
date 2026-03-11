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
import { ServiceWorkerRegister } from "@/components/service-worker";
import { ThemeMeta } from "@/components/theme-meta";
import { Toaster } from "@/components/ui/sonner";
import {
	materialThemeCss,
	materialThemeMetaColors,
} from "@/lib/material-theme";
import appCss from "@/styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
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
	return (
		<html lang="ca" suppressHydrationWarning>
			<head>
				<HeadContent />
				<style>{materialThemeCss}</style>
			</head>
			<body className="h-dvh overflow-hidden bg-background text-foreground">
				<ThemeProvider storageKey="paraules-theme" attribute="class">
					<ThemeMeta />
					<ServiceWorkerRegister />
					<div className="flex flex-col h-dvh">
						<Header />
						<main className="flex-1 overflow-y-auto">
							<Outlet />
						</main>
					</div>
					<Toaster position="top-center" />
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
