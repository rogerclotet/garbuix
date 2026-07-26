import { useEffect, useRef } from "react";
import type { DailyPuzzleWordSlot } from "@/lib/puzzle-types";
import { getSlotCellKey } from "./daily-helpers";

const FLY_DURATION_MS = 740;
const STAGGER_MS = 42;
export const HIGHLIGHT_AFTER_LAND_MS = 1400;
export const GRID_GUESS_BOUNCE_MS = 280;
const FLY_SPRING_START = 0.72;
const FLY_LAND_PROGRESS = 0.97;

function easeInQuart(t: number): number {
	return t * t * t * t;
}

function easeInQuad(t: number): number {
	return t * t;
}

// Overshoots past 1 then settles — springy arrival.
function easeOutBack(t: number): number {
	const overshoot = 1.70158 * 1.35;
	const shifted = t - 1;
	return shifted * shifted * ((overshoot + 1) * shifted + overshoot) + 1;
}

function flyLetterPathProgress(progress: number): number {
	if (progress <= FLY_SPRING_START) {
		const local = progress / FLY_SPRING_START;
		return easeInQuart(local) * 0.84;
	}

	const local = (progress - FLY_SPRING_START) / (1 - FLY_SPRING_START);
	return 0.84 + easeOutBack(local) * 0.16;
}

function flyLetterOpacity(progress: number): number {
	return Math.min(1, easeInQuad(Math.min(progress / 0.14, 1)) * 1.15);
}

function flyLetterScale(progress: number, pathProgress: number): number {
	if (progress < 0.1) {
		return 0.68 + easeInQuad(progress / 0.1) * 0.1;
	}

	if (progress > FLY_SPRING_START) {
		const local = (progress - FLY_SPRING_START) / (1 - FLY_SPRING_START);
		const springBump = Math.sin(local * Math.PI) * 0.18 * (1 - local * 0.35);
		return 0.96 + springBump;
	}

	return 0.82 + Math.sin(pathProgress * Math.PI) * 0.22;
}

export type FlyingLetterPath = {
	id: string;
	cellKey: string;
	letter: string;
	from: { x: number; y: number };
	to: { x: number; y: number };
	control: { x: number; y: number };
	delay: number;
	fontSize: number;
	rotation: number;
};

export type FlyingLettersAnimation = {
	id: number;
	paths: FlyingLetterPath[];
};

type DailyFlyingLettersProps = {
	animation: FlyingLettersAnimation | null;
	onLetterLand?: (cellKey: string) => void;
	onComplete: () => void;
};

function quadraticBezier(
	t: number,
	p0: number,
	p1: number,
	p2: number,
): number {
	const inverse = 1 - t;
	return inverse * inverse * p0 + 2 * inverse * t * p1 + t * t * p2;
}

function measureTextLetterPositions(element: HTMLElement) {
	const positions: { x: number; y: number; fontSize: number }[] = [];
	const textNode = element.firstChild;

	if (!(textNode instanceof Text) || textNode.data.length === 0) {
		const rect = element.getBoundingClientRect();
		const fontSize =
			Number.parseFloat(getComputedStyle(element).fontSize) || 24;
		return [
			{
				x: rect.left + rect.width / 2,
				y: rect.top + rect.height / 2,
				fontSize,
			},
		];
	}

	const range = document.createRange();
	for (let index = 0; index < textNode.data.length; index += 1) {
		const character = textNode.data[index];
		if (character === "·") {
			continue;
		}

		range.setStart(textNode, index);
		range.setEnd(textNode, index + 1);
		const rect = range.getBoundingClientRect();
		positions.push({
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
			fontSize:
				rect.height ||
				Number.parseFloat(getComputedStyle(element).fontSize) ||
				24,
		});
	}

	return positions;
}

function buildCurveControl(
	from: { x: number; y: number },
	to: { x: number; y: number },
	index: number,
): { x: number; y: number } {
	const midX = (from.x + to.x) / 2;
	const midY = (from.y + to.y) / 2;
	const deltaX = to.x - from.x;
	const deltaY = to.y - from.y;
	const distance = Math.hypot(deltaX, deltaY) || 1;
	const perpendicularX = -deltaY / distance;
	const perpendicularY = deltaX / distance;
	const side = index % 2 === 0 ? 1 : -1;
	const curveStrength = distance * (0.25 + Math.random() * 0.45);
	const driftX = (Math.random() - 0.5) * distance * 0.35;
	const driftY = (Math.random() - 0.5) * distance * 0.25;

	return {
		x: midX + perpendicularX * curveStrength * side + driftX,
		y: midY + perpendicularY * curveStrength * side + driftY,
	};
}

export function buildFlyingLetterPaths(options: {
	sourceElement: HTMLElement;
	targetCellKeys: string[];
	letters: string[];
	gridRoot: HTMLElement;
}): FlyingLetterPath[] {
	const sourcePositions = measureTextLetterPositions(options.sourceElement);
	const sourceFallbackRect = options.sourceElement.getBoundingClientRect();
	const paths: FlyingLetterPath[] = [];

	for (let index = 0; index < options.letters.length; index += 1) {
		const cellKey = options.targetCellKeys[index];
		const letter = options.letters[index];
		if (!cellKey || !letter) {
			continue;
		}

		const targetCell = options.gridRoot.querySelector(
			`[data-cell-key="${cellKey}"]`,
		);
		if (!(targetCell instanceof HTMLElement)) {
			continue;
		}

		const targetRect = targetCell.getBoundingClientRect();
		const source = sourcePositions[index] ??
			sourcePositions[sourcePositions.length - 1] ?? {
				x: sourceFallbackRect.left + sourceFallbackRect.width / 2,
				y: sourceFallbackRect.top + sourceFallbackRect.height / 2,
				fontSize: 24,
			};
		const to = {
			x: targetRect.left + targetRect.width / 2,
			y: targetRect.top + targetRect.height / 2,
		};
		const fontSize = Math.min(source.fontSize, targetRect.height * 0.72, 36);

		paths.push({
			id: `${cellKey}-${index}`,
			cellKey,
			letter: letter.toUpperCase(),
			from: { x: source.x, y: source.y },
			to,
			control: buildCurveControl(source, to, index),
			delay: index * STAGGER_MS,
			fontSize,
			rotation: (Math.random() - 0.5) * 50,
		});
	}

	return paths;
}

export function getFlyingLettersDuration(pathCount: number): number {
	if (pathCount <= 0) {
		return 0;
	}

	return (pathCount - 1) * STAGGER_MS + FLY_DURATION_MS;
}

export function getWordCellKeysInOrder(slot: DailyPuzzleWordSlot): string[] {
	return Array.from({ length: slot.length }, (_, index) =>
		getSlotCellKey(slot, index),
	);
}

export function DailyFlyingLetters({
	animation,
	onLetterLand,
	onComplete,
}: DailyFlyingLettersProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const onCompleteRef = useRef(onComplete);
	const onLetterLandRef = useRef(onLetterLand);
	onCompleteRef.current = onComplete;
	onLetterLandRef.current = onLetterLand;
	const paths = animation?.paths ?? [];

	useEffect(() => {
		if (!animation || animation.paths.length === 0) {
			return;
		}

		if (
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			onCompleteRef.current();
			return;
		}

		let frameId: number | null = null;
		const startTime = performance.now();
		const totalDuration = getFlyingLettersDuration(animation.paths.length) + 80;
		const landedPathIds = new Set<string>();
		let completed = false;

		const finish = () => {
			if (completed) {
				return;
			}
			completed = true;
			if (frameId != null) {
				cancelAnimationFrame(frameId);
			}
			onCompleteRef.current();
		};

		const tick = (now: number) => {
			const container = containerRef.current;
			if (!container) {
				frameId = requestAnimationFrame(tick);
				return;
			}

			const elapsed = now - startTime;
			let allDone = true;

			for (const path of animation.paths) {
				const element = container.querySelector<HTMLElement>(
					`[data-flying-letter="${path.id}"]`,
				);
				if (!element) {
					allDone = false;
					continue;
				}

				const localElapsed = elapsed - path.delay;
				if (localElapsed < 0) {
					allDone = false;
					element.style.opacity = "0";
					continue;
				}

				const progress = Math.min(localElapsed / FLY_DURATION_MS, 1);
				if (progress < FLY_LAND_PROGRESS) {
					allDone = false;
				} else if (!landedPathIds.has(path.id)) {
					landedPathIds.add(path.id);
					element.style.opacity = "0";
					onLetterLandRef.current?.(path.cellKey);
				}

				if (progress >= FLY_LAND_PROGRESS) {
					continue;
				}

				const pathProgress = flyLetterPathProgress(progress);
				const x = quadraticBezier(
					pathProgress,
					path.from.x,
					path.control.x,
					path.to.x,
				);
				const y = quadraticBezier(
					pathProgress,
					path.from.y,
					path.control.y,
					path.to.y,
				);
				const scale = flyLetterScale(progress, pathProgress);
				const rotation = path.rotation * (1 - Math.min(pathProgress, 1));
				const opacity = flyLetterOpacity(progress);

				element.style.opacity = `${opacity}`;
				element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`;
			}

			if (elapsed >= totalDuration && allDone) {
				finish();
				return;
			}

			frameId = requestAnimationFrame(tick);
		};

		frameId = requestAnimationFrame(tick);

		return () => {
			completed = true;
			if (frameId != null) {
				cancelAnimationFrame(frameId);
			}
		};
	}, [animation]);

	if (paths.length === 0) {
		return null;
	}

	return (
		<div
			ref={containerRef}
			className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
			aria-hidden
		>
			{paths.map((path) => (
				<span
					key={path.id}
					data-flying-letter={path.id}
					className="absolute left-0 top-0 font-bold leading-none text-foreground will-change-transform"
					style={{
						fontSize: `${path.fontSize}px`,
						opacity: 0,
						textShadow:
							"0 1px 2px color-mix(in srgb, var(--color-background) 70%, transparent)",
					}}
				>
					{path.letter}
				</span>
			))}
		</div>
	);
}
