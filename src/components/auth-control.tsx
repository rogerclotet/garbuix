import { getRouteApi, useRouter } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useActiveSessionUser } from "@/lib/use-active-session-user";
import { useObservability } from "@/lib/use-observability";

const rootRoute = getRouteApi("__root__");

export function AuthControl() {
	const rootData = rootRoute.useLoaderData();
	const router = useRouter();
	const { activeUser, session } = useActiveSessionUser(rootData.sessionUser);
	const { captureEvent, resetUser } = useObservability();

	if (session.isPending) {
		return (
			<Button variant="ghost" size="sm" disabled>
				Compte...
			</Button>
		);
	}

	if (!activeUser) {
		return (
			<Button
				variant="ghost"
				size="sm"
				onClick={async () => {
					captureEvent("auth_sign_in_started", {
						provider: "google",
					});
					await authClient.signIn.social({
						provider: "google",
						callbackURL: window.location.href,
					});
				}}
			>
				Entrar
			</Button>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<span className="hidden sm:inline text-sm opacity-80">
				{activeUser.name}
			</span>
			<Button
				variant="ghost"
				size="icon"
				onClick={async () => {
					captureEvent("auth_sign_out_clicked");
					resetUser();
					await authClient.signOut();
					await session.refetch();
					await router.invalidate({ sync: true });
				}}
				aria-label="Tancar sessió"
			>
				<LogOut className="h-4 w-4" />
			</Button>
		</div>
	);
}
