import { Collapsible } from "@base-ui/react/collapsible";
import type { ReactElement, ReactNode } from "react";

// How long the panel takes to open or close. Callers that need the final
// height (e.g. to scroll it into view) wait this long.
export const REVEAL_DURATION_MS = 250;

// A panel that slides down from under its trigger (or from nothing, when
// there's no trigger) and fades in. Contents unmount once it has closed.
export function Reveal({
	open,
	onOpenChange,
	trigger,
	children,
}: {
	open: boolean;
	onOpenChange?: (open: boolean) => void;
	// Rendered as the Collapsible trigger, so it gets aria-expanded and toggles
	// the panel.
	trigger?: ReactElement;
	children: ReactNode;
}) {
	return (
		<Collapsible.Root open={open} onOpenChange={onOpenChange}>
			{trigger ? <Collapsible.Trigger render={trigger} /> : null}
			<Collapsible.Panel className="group h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] data-starting-style:h-0 data-ending-style:h-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden">
				<div className="transition-[opacity,translate] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-ending-style:-translate-y-2 group-data-ending-style:opacity-0 group-data-starting-style:-translate-y-2 group-data-starting-style:opacity-0 motion-reduce:transition-none">
					{children}
				</div>
			</Collapsible.Panel>
		</Collapsible.Root>
	);
}
