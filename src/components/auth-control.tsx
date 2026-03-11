import { getRouteApi } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const rootRoute = getRouteApi("__root__");

export function AuthControl() {
	const rootData = rootRoute.useLoaderData();
	const session = authClient.useSession();
	const activeUser = session.data?.user ?? rootData.sessionUser;

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
					await authClient.signOut();
					window.location.reload();
				}}
				aria-label="Tancar sessió"
			>
				<LogOut className="h-4 w-4" />
			</Button>
		</div>
	);
}
