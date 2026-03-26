import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";

export default function Header() {
	return (
		<header className="bg-background/80 backdrop-blur-md border-b border-border/50 transition-colors duration-300">
			<div className="max-w-7xl mx-auto px-3 sm:px-4 pb-3 sm:pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
				<div className="flex items-center justify-between">
					<Link
						to="/"
						className="flex items-center gap-3 hover:opacity-80 transition-opacity"
					>
						<Logo className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
						<h1 className="text-xl sm:text-2xl font-bold text-primary">
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
