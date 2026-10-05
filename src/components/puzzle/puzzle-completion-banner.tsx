import type { ReactNode } from "react";

export function PuzzleCompletionBanner({ children }: { children: ReactNode }) {
	return (
		<div className="mx-auto w-full max-w-md shrink-0 space-y-1 px-3 py-6 text-center">
			<h2 className="text-lg font-extrabold text-primary">
				Les has trobades totes!
			</h2>
			{children}
		</div>
	);
}
