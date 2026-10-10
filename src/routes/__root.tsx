import { captureException } from "@sentry/tanstackstart-react";
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
import { ClueRequestsRoot } from "@/components/clue/clue-requests-root";
import Header from "@/components/header";
import { LeaderboardRoot } from "@/components/leaderboard/leaderboard-root";
import { LeaderboardToasts } from "@/components/leaderboard/leaderboard-toast";
import { links } from "@/components/meta";
import { OrientationLock } from "@/components/orientation-lock";
import { ServiceWorkerRegister } from "@/components/service-worker";
import { SignInDialog } from "@/components/sign-in/sign-in-dialog";
import { ThemeMeta } from "@/components/theme-meta";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSignInMethods } from "@/lib/auth-server-fns";
import { materialThemeCss } from "@/lib/material-theme";
import { getTodayDateKey } from "@/lib/puzzle-dates";
import { getSessionUser } from "@/lib/puzzle-server-fns";
import type { SignInMethod } from "@/lib/sign-in-methods";
import { useMiniRoute } from "@/lib/use-mini-route";
import { useSyllableRoute } from "@/lib/use-syllable-route";
import appCss from "@/styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

// Which sign-in methods the server offers only changes on a redeploy, so the
// browser asks once instead of on every navigation.
let cachedSignInMethods: SignInMethod[] | null = null;

async function loadSignInMethods(): Promise<SignInMethod[]> {
	if (cachedSignInMethods) return cachedSignInMethods;
	try {
		const methods = await getSignInMethods();
		if (typeof window !== "undefined") {
			cachedSignInMethods = methods;
		}
		return methods;
	} catch (error) {
		// Every page waits on this loader, so a failed lookup must not take the
		// app down with it. The dialog says sign-in is unavailable and the next
		// navigation asks again.
		captureException(error);
		return [];
	}
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	loader: async () => {
		const [sessionUser, signInMethods] = await Promise.all([
			getSessionUser(),
			loadSignInMethods(),
		]);
		return { sessionUser, signInMethods, dateKey: getTodayDateKey() };
	},

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
				title: "Garbuix! - Joc de Mots Encreuats en Català",
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
	const mini = useMiniRoute();
	const syllables = useSyllableRoute();
	const showDevtools = import.meta.env.DEV;

	return (
		<html
			lang="ca"
			data-game={syllables ? "syllables" : mini ? "mini" : "regular"}
			suppressHydrationWarning
		>
			<head>
				<HeadContent />
				<style>{materialThemeCss}</style>
			</head>
			<body className="min-h-svh bg-background text-foreground">
				<ThemeProvider
					storageKey="paraules-theme-v2"
					attribute="class"
					defaultTheme="system"
					enableSystem
				>
					<TooltipProvider delayDuration={300}>
						<ThemeMeta mini={mini} syllables={syllables} />
						<OrientationLock />
						<ServiceWorkerRegister />
						<LeaderboardRoot>
							<ClueRequestsRoot>
								<div className="flex h-svh flex-col">
									<Header />
									{/* Positioned as well as scrollable: an absolutely
										    positioned descendant with no closer containing block
										    would otherwise be measured against the document, so a
										    visually hidden input far down a long page stretches
										    the page past the viewport and lets the browser scroll
										    the whole shell, header included, out of view. */}
									<main className="relative flex-1 min-h-0 overflow-y-auto">
										<Outlet />
									</main>
								</div>
								<Toaster position="top-center" />
								<SignInDialog />
								{mini || syllables ? null : <LeaderboardToasts />}
							</ClueRequestsRoot>
						</LeaderboardRoot>
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
					</TooltipProvider>
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
