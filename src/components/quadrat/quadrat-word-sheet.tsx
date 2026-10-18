import { ChevronDown, ListChecks } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// On a phone the board takes the screen, and the list waits in a sheet that
// slides up from a button under it.
export function QuadratWordSheet({
	foundCount,
	totalWords,
	triggerClassName,
	children,
}: {
	foundCount: number;
	totalWords: number;
	triggerClassName?: string;
	children: ReactNode;
}) {
	return (
		<Dialog.Root>
			<Dialog.Trigger asChild>
				<Button
					variant="ghost"
					size="lg"
					className={cn(
						"daily-pressable daily-pressable-action h-9 gap-2 touch-manipulation sm:h-10",
						triggerClassName,
					)}
					aria-label={`Paraules, ${foundCount} de ${totalWords} trobades`}
				>
					<ListChecks className="size-4 text-primary" aria-hidden />
					Paraules
					<span className="tabular-nums text-muted-foreground font-ui">
						{foundCount}/{totalWords}
					</span>
				</Button>
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 duration-200 supports-backdrop-filter:backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
				<Dialog.Content
					aria-describedby={undefined}
					className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85svh] flex-col rounded-t-2xl bg-background pb-[env(safe-area-inset-bottom)] text-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom"
				>
					<div className="flex shrink-0 items-center justify-between gap-2 py-3 pr-2 pl-5">
						<Dialog.Title className="text-2xl font-extrabold tracking-tight">
							Paraules
						</Dialog.Title>
						<Dialog.Close asChild>
							<Button
								variant="ghost"
								size="icon-lg"
								className="size-11 text-muted-foreground"
								aria-label="Amaga les paraules"
							>
								<ChevronDown className="size-5" />
							</Button>
						</Dialog.Close>
					</div>
					<div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
						{children}
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
