import { cn } from "@/lib/utils";

// Redesigned progress: one ring carrying both counters instead of two stacked
// meters. The outer arc is words found, the inner one is the progress toward the
// free letter that off-puzzle words earn.

const RING_SIZE = 42;
const RING_STROKE = 3.5;

export function DailyProgressRing({
	found,
	total,
	bonusInCycle,
	bonusTarget,
	showBonus,
	pulse,
}: {
	found: number;
	total: number;
	bonusInCycle: number;
	bonusTarget: number;
	showBonus: boolean;
	pulse: boolean;
}) {
	const outerRadius = (RING_SIZE - RING_STROKE) / 2;
	const innerRadius = outerRadius - RING_STROKE - 2;
	const wordProgress = total === 0 ? 0 : found / total;
	const bonusProgress = bonusTarget === 0 ? 0 : bonusInCycle / bonusTarget;

	const arc = (radius: number, progress: number) => {
		const circumference = 2 * Math.PI * radius;
		return {
			strokeDasharray: circumference,
			strokeDashoffset: circumference * (1 - progress),
		};
	};

	return (
		<div
			className={cn(
				"relative shrink-0 transition-transform",
				pulse && "scale-110",
			)}
			style={{ width: RING_SIZE, height: RING_SIZE }}
		>
			<svg
				width={RING_SIZE}
				height={RING_SIZE}
				className="-rotate-90"
				role="presentation"
			>
				<circle
					cx={RING_SIZE / 2}
					cy={RING_SIZE / 2}
					r={outerRadius}
					fill="none"
					strokeWidth={RING_STROKE}
					className="stroke-muted"
				/>
				<circle
					cx={RING_SIZE / 2}
					cy={RING_SIZE / 2}
					r={outerRadius}
					fill="none"
					strokeWidth={RING_STROKE}
					strokeLinecap="round"
					{...arc(outerRadius, wordProgress)}
					className="stroke-primary transition-[stroke-dashoffset] duration-500"
				/>
				{showBonus ? (
					<>
						<circle
							cx={RING_SIZE / 2}
							cy={RING_SIZE / 2}
							r={innerRadius}
							fill="none"
							strokeWidth={RING_STROKE - 1}
							className="stroke-muted"
						/>
						<circle
							cx={RING_SIZE / 2}
							cy={RING_SIZE / 2}
							r={innerRadius}
							fill="none"
							strokeWidth={RING_STROKE - 1}
							strokeLinecap="round"
							{...arc(innerRadius, bonusProgress)}
							className="stroke-game-extra transition-[stroke-dashoffset] duration-500"
						/>
					</>
				) : null}
			</svg>
			<span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums font-ui">
				{found}
			</span>
		</div>
	);
}
