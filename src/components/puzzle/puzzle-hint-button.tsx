import { Lightbulb, Sparkles } from "lucide-react";
import type { PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HINT_HOLD_MS = 600;

// A hint is spent by holding the button, so a stray tap never costs one.
export function PuzzleHintButton({
	canUseHint,
	aiClueMode,
	label,
	description,
	highlighted = false,
	onHint,
}: {
	canUseHint: boolean;
	aiClueMode: boolean;
	label: string;
	description: string;
	// Ringed while the tutorial points at it.
	highlighted?: boolean;
	onHint: () => void;
}) {
	const [hintHoldProgress, setHintHoldProgress] = useState(0);
	const hintHoldFrameRef = useRef<number | null>(null);
	useEffect(
		() => () => {
			if (hintHoldFrameRef.current != null) {
				cancelAnimationFrame(hintHoldFrameRef.current);
			}
		},
		[],
	);

	const cancelHintHold = () => {
		if (hintHoldFrameRef.current != null) {
			cancelAnimationFrame(hintHoldFrameRef.current);
			hintHoldFrameRef.current = null;
		}
		setHintHoldProgress(0);
	};

	const handleHintPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
		if (!canUseHint) return;
		if (event.pointerType === "mouse" && event.button !== 0) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);

		const startTime = performance.now();

		const tick = (now: number) => {
			const progress = Math.min((now - startTime) / HINT_HOLD_MS, 1);
			setHintHoldProgress(progress);

			if (progress < 1) {
				hintHoldFrameRef.current = requestAnimationFrame(tick);
			} else {
				hintHoldFrameRef.current = null;
				setHintHoldProgress(0);
				onHint();
			}
		};

		hintHoldFrameRef.current = requestAnimationFrame(tick);
	};

	const Icon = aiClueMode ? Sparkles : Lightbulb;

	return (
		<Button
			variant="ghost"
			onPointerDown={handleHintPointerDown}
			onPointerUp={cancelHintHold}
			onPointerLeave={cancelHintHold}
			onPointerCancel={cancelHintHold}
			onClick={(event) => {
				// Keyboard and assistive-technology activation has no pointer hold.
				if (event.detail === 0 && canUseHint) onHint();
			}}
			onContextMenu={(e) => e.preventDefault()}
			className={cn(
				"daily-pressable daily-pressable-action gap-2 h-9 sm:h-10 touch-manipulation relative overflow-hidden select-none",
				highlighted &&
					"ring-2 ring-amber-500 ring-offset-2 ring-offset-background bg-amber-500/10",
			)}
			disabled={!canUseHint}
			size="lg"
			aria-description={description}
		>
			<span
				className="absolute inset-0 bg-amber-400/25 origin-left"
				style={{ transform: `scaleX(${hintHoldProgress})` }}
				aria-hidden
			/>
			<Icon
				className={`relative w-4 h-4 ${canUseHint ? "text-amber-500" : "text-muted-foreground/40"}`}
			/>
			<span className="relative">{label}</span>
		</Button>
	);
}
