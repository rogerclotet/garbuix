import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Header() {
	return (
		<header className="bg-indigo-600 dark:bg-slate-900 text-white shadow-md border-b border-indigo-700 dark:border-slate-800 transition-colors">
			<div className="max-w-7xl mx-auto px-4 py-4">
				<div className="flex items-center justify-between">
					<Link
						to="/"
						className="flex items-center gap-3 hover:opacity-90 transition-opacity"
					>
						<div className="text-2xl">🎯</div>
						<h1 className="text-2xl font-bold">Paraules</h1>
					</Link>
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}
