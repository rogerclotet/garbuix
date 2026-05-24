import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Progress({
	className,
	value,
	...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
	const max = props.max || 100;
	const percent = Math.min(Math.max(value || 0, 0), max) / max;

	return (
		<ProgressPrimitive.Root
			data-slot="progress"
			className={cn(
				"bg-muted h-1 rounded-full relative flex w-full items-center overflow-x-hidden",
				className,
			)}
			{...props}
		>
			<ProgressPrimitive.Indicator
				data-slot="progress-indicator"
				className="bg-primary h-full rounded-full transition-all"
				style={{ width: `${percent * 100}%` }}
			/>
		</ProgressPrimitive.Root>
	);
}

export { Progress };
