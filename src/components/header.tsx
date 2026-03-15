import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";

export default function Header() {
	return (
		<header className="bg-primary text-primary-foreground shadow-md border-b border-background transition-colors duration-500">
			<div className="max-w-7xl mx-auto px-3 sm:px-4 pb-3 sm:pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
				<div className="flex items-center justify-between">
					<Link
						to="/"
						className="flex items-center gap-3 hover:opacity-90 transition-opacity"
					>
						<Logo className="w-5 h-5 sm:w-6 sm:h-6 opacity-60" />
						<h1 className="text-xl sm:text-2xl font-bold opacity-80">
							Paraules
						</h1>
					</Link>
					<div className="flex items-center gap-2">
						<UserMenu />
					</div>
				</div>
			</div>
		</header>
	);
}
