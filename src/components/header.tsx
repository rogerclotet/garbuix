import { Link } from "@tanstack/react-router";
import { History as HistoryIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function Header() {
	return (
		<header className="bg-primary text-primary-foreground shadow-md border-b border-background transition-colors duration-500">
			<div className="max-w-7xl mx-auto px-4 py-4">
				<div className="flex items-center justify-between">
					<Link
						to="/"
						className="flex items-center gap-3 hover:opacity-90 transition-opacity"
					>
						<Logo className="w-6 h-6 opacity-60" />
						<h1 className="text-2xl font-bold opacity-80">Paraules</h1>
					</Link>
					<div className="flex items-center gap-2">
						<Button variant="ghost" size="icon" asChild>
							<Link to="/dies-anteriors" aria-label="Dies anteriors">
								<HistoryIcon className="h-5 w-5" />
							</Link>
						</Button>
						<ThemeToggle />
					</div>
				</div>
			</div>
		</header>
	);
}
