import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";

const INNER_PAGE_TITLES: Record<string, string> = {
	"/classificacio": "Classificació",
	"/dies-anteriors": "Dies anteriors",
	"/preferencies": "Preferències",
};

export default function Header() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const innerTitle = INNER_PAGE_TITLES[pathname];

	return (
		<header className="bg-background/80 backdrop-blur-md border-b border-border/50 transition-colors duration-300">
			<div className="max-w-7xl mx-auto px-3 sm:px-4 pb-3 sm:pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
				<div className="flex items-center justify-between gap-2">
					{innerTitle ? (
						<div className="flex min-w-0 items-center gap-1 sm:gap-2">
							<Button
								variant="ghost"
								size="icon-lg"
								asChild
								className="size-11 -ml-2 rounded-full text-foreground hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/20 sm:size-9 sm:-ml-1"
							>
								<Link to="/" aria-label="Tornar">
									<ChevronLeft className="size-6 sm:size-5" />
								</Link>
							</Button>
							<h1 className="truncate text-xl sm:text-2xl font-bold text-primary">
								{innerTitle}
							</h1>
						</div>
					) : (
						<Link
							to="/"
							className="flex items-center gap-3 hover:opacity-80 transition-opacity"
						>
							<Logo className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
							<h1 className="text-xl sm:text-2xl font-bold text-primary">
								Paraules
							</h1>
						</Link>
					)}
					<div className="flex items-center gap-2">
						<UserMenu />
					</div>
				</div>
			</div>
		</header>
	);
}
