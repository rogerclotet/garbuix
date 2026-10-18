import {
	type CSSProperties,
	type PointerEvent,
	useId,
	useMemo,
	useRef,
} from "react";
import { HELD_FOUND_WORD_MS } from "@/components/puzzle/puzzle-animation-timing";
import {
	canExtendPath,
	getCellCol,
	getCellRow,
	isConnectionAvailable,
	type QuadratBoardState,
} from "@/lib/quadrat-board";
import {
	QUADRAT_CELL_COUNT,
	QUADRAT_SIZE,
	type QuadratConnection,
} from "@/lib/quadrat-types";
import { cn } from "@/lib/utils";

// Distances are in tile widths. The gap leaves room for the connections
// between tiles.
const GAP = 0.55;
const PITCH = 1 + GAP;
const SPAN = QUADRAT_SIZE + (QUADRAT_SIZE - 1) * GAP;
// A moving finger enters a tile only near its center, so a diagonal stroke
// that grazes the corner of a neighbour does not pick it up.
const MOVE_HIT_RADIUS = 0.48;
const START_HIT_RADIUS = 0.7;
const FLASH_STAGGER_MS = 34;
const CELLS = Array.from({ length: QUADRAT_CELL_COUNT }, (_, cell) => cell);
const NO_GUIDE: number[] = [];

function getCellCenter(cell: number) {
	return {
		x: getCellCol(cell) * PITCH + 0.5,
		y: getCellRow(cell) * PITCH + 0.5,
	};
}

function toPercent(units: number): string {
	return `${(units / SPAN) * 100}%`;
}

function findCellAt(x: number, y: number, radius: number): number | null {
	const col = Math.round((x - 0.5) / PITCH);
	const row = Math.round((y - 0.5) / PITCH);
	if (col < 0 || col >= QUADRAT_SIZE || row < 0 || row >= QUADRAT_SIZE) {
		return null;
	}
	const cell = row * QUADRAT_SIZE + col;
	const center = getCellCenter(cell);
	return Math.hypot(x - center.x, y - center.y) <= radius ? cell : null;
}

function ConnectionLine({
	cells: [from, to],
	className,
	stroke,
	style,
	width,
}: {
	cells: readonly [number, number];
	className?: string;
	stroke?: string;
	style?: CSSProperties;
	width: number;
}) {
	const start = getCellCenter(from);
	const end = getCellCenter(to);
	return (
		<line
			x1={start.x}
			y1={start.y}
			x2={end.x}
			y2={end.y}
			className={className}
			stroke={stroke}
			style={style}
			strokeWidth={width}
			strokeLinecap="round"
		/>
	);
}

export function QuadratBoard({
	letters,
	connections,
	board,
	path,
	interactive,
	complete,
	clueStarts,
	flashPath,
	guidePath = NO_GUIDE,
	onPathChange,
	onRelease,
}: {
	letters: string[];
	connections: QuadratConnection[];
	board: QuadratBoardState;
	// The drag in progress.
	path: number[];
	interactive: boolean;
	// A finished board shows every letter and line plainly, without counts.
	complete: boolean;
	clueStarts: Array<[number, number]>;
	// The word just found, lit letter by letter while it shows above the board.
	flashPath: number[] | null;
	// The tutorial's marked route: its tiles and lines stand out, and its
	// first tile pulses until a drag starts.
	guidePath?: number[];
	onPathChange: (path: number[]) => void;
	onRelease: (path: number[]) => void;
}) {
	const boardRef = useRef<HTMLFieldSetElement>(null);
	// The live drag, read by pointer handlers between renders.
	const dragRef = useRef<{ pointerId: number; path: number[] } | null>(null);
	const gradientIdPrefix = useId();
	const visibleConnections = complete
		? connections
		: connections.filter(({ cells: [from, to] }) =>
				isConnectionAvailable(board, from, to),
			);
	const clueStartCells = useMemo(
		() => new Set(clueStarts.map(([first]) => first)),
		[clueStarts],
	);
	const guideCells = useMemo(() => new Set(guidePath), [guidePath]);

	const toBoardUnits = (event: { clientX: number; clientY: number }) => {
		const rect = boardRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0) return null;
		return {
			x: ((event.clientX - rect.left) / rect.width) * SPAN,
			y: ((event.clientY - rect.top) / rect.height) * SPAN,
		};
	};

	const handlePointerDown = (event: PointerEvent<HTMLFieldSetElement>) => {
		if (!interactive || dragRef.current) return;
		if (event.pointerType === "mouse" && event.button !== 0) return;
		const point = toBoardUnits(event);
		const cell = point && findCellAt(point.x, point.y, START_HIT_RADIUS);
		if (cell == null || !canExtendPath(board, [], cell)) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = { pointerId: event.pointerId, path: [cell] };
		onPathChange([cell]);
	};

	const extendDrag = (point: { x: number; y: number }) => {
		const drag = dragRef.current;
		if (!drag) return;
		const cell = findCellAt(point.x, point.y, MOVE_HIT_RADIUS);
		if (cell == null || cell === drag.path.at(-1)) return;
		if (cell === drag.path.at(-2)) {
			drag.path = drag.path.slice(0, -1);
		} else if (canExtendPath(board, drag.path, cell)) {
			drag.path = [...drag.path, cell];
		} else {
			return;
		}
		onPathChange(drag.path);
	};

	const handlePointerMove = (event: PointerEvent<HTMLFieldSetElement>) => {
		if (dragRef.current?.pointerId !== event.pointerId) return;
		// A quick stroke can cross a tile between two move events; the
		// coalesced points still pass through it.
		const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
		for (const sample of samples.length > 0 ? samples : [event]) {
			const point = toBoardUnits(sample);
			if (point) extendDrag(point);
		}
	};

	const handlePointerUp = (event: PointerEvent<HTMLFieldSetElement>) => {
		const drag = dragRef.current;
		if (drag?.pointerId !== event.pointerId) return;
		dragRef.current = null;
		onRelease(drag.path);
	};

	const handlePointerCancel = (event: PointerEvent<HTMLFieldSetElement>) => {
		if (dragRef.current?.pointerId !== event.pointerId) return;
		dragRef.current = null;
		onPathChange([]);
	};

	const pathConnections = path
		.slice(1)
		.map((cell, index) => [path[index] as number, cell] as const);
	const guideConnections = guidePath
		.slice(1)
		.map((cell, index) => [guidePath[index] as number, cell] as const);
	const flashConnections = (flashPath ?? [])
		.slice(1)
		.map((cell, index) => [flashPath?.[index] as number, cell] as const);
	// Every tile and line lets go at the same moment, however late it lit.
	const flashTiming = (delayMs: number) => ({
		animationDelay: `${delayMs}ms`,
		animationDuration: `${HELD_FOUND_WORD_MS - delayMs}ms`,
	});

	return (
		<fieldset
			ref={boardRef}
			aria-label="Tauler de lletres. Arrossega d'una lletra a l'altra per formar una paraula."
			className="relative m-0 aspect-square w-full min-w-0 touch-none select-none border-0 p-0 [container-type:inline-size]"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerCancel}
			onContextMenu={(event) => event.preventDefault()}
		>
			<svg
				viewBox={`0 0 ${SPAN} ${SPAN}`}
				className="pointer-events-none absolute inset-0 size-full overflow-visible"
				aria-hidden
			>
				<defs>
					{clueStarts.map(([from, to]) => {
						const start = getCellCenter(from);
						const end = getCellCenter(to);
						return (
							// User-space coordinates: a bounding-box gradient on a
							// straight line has zero height and paints nothing.
							<linearGradient
								key={`${from}-${to}`}
								id={`${gradientIdPrefix}-clue-${from}-${to}`}
								gradientUnits="userSpaceOnUse"
								x1={start.x}
								y1={start.y}
								x2={end.x}
								y2={end.y}
							>
								<stop offset="0%" stopColor="var(--color-green-500)" />
								<stop offset="100%" stopColor="var(--color-blue-500)" />
							</linearGradient>
						);
					})}
				</defs>
				{visibleConnections.map(({ cells }) => (
					<ConnectionLine
						key={`${cells[0]}-${cells[1]}`}
						cells={cells}
						// Opaque, so crossing lines do not darken where they overlap.
						className="stroke-border"
						width={0.09}
					/>
				))}
				{complete
					? null
					: clueStarts.map(([from, to]) => (
							<ConnectionLine
								key={`clue-${from}-${to}`}
								cells={[from, to]}
								stroke={`url(#${gradientIdPrefix}-clue-${from}-${to})`}
								width={0.16}
							/>
						))}
				{guideConnections.map((cells) => (
					<ConnectionLine
						key={`guide-${cells[0]}-${cells[1]}`}
						cells={cells}
						className="stroke-primary/50"
						width={0.16}
					/>
				))}
				{flashConnections.map((cells, index) => (
					<ConnectionLine
						key={`found-${cells[0]}-${cells[1]}`}
						cells={cells}
						className="quadrat-found-line stroke-[var(--quadrat-found)]"
						style={flashTiming((index + 1) * FLASH_STAGGER_MS)}
						width={0.2}
					/>
				))}
				{pathConnections.map((cells) => (
					<ConnectionLine
						key={`path-${cells[0]}-${cells[1]}`}
						cells={cells}
						className="stroke-primary"
						width={0.2}
					/>
				))}
			</svg>
			{CELLS.map((cell) => {
				const letter = letters[cell] ?? "";
				const uses = board.cellUses[cell] ?? 0;
				const selected = path.includes(cell);
				const flashIndex = flashPath?.indexOf(cell) ?? -1;
				const flashing = flashIndex >= 0;
				const { x, y } = getCellCenter(cell);
				const style: CSSProperties = {
					left: toPercent(x - 0.5),
					top: toPercent(y - 0.5),
					width: toPercent(1),
					height: toPercent(1),
					fontSize: `calc(100cqi / ${SPAN} * 0.46)`,
					...(flashing ? flashTiming(flashIndex * FLASH_STAGGER_MS) : {}),
				};
				const label = letter.toUpperCase();
				// Only dimming fades: a tile joins the drag the moment the finger
				// reaches it.
				return (
					<div
						key={cell}
						data-cell={cell}
						role="img"
						aria-label={
							complete
								? label
								: uses === 1
									? `${label}, 1 paraula`
									: `${label}, ${uses} paraules`
						}
						className={cn(
							"puzzle-cell quadrat-cell absolute flex items-center justify-center border-2 font-bold leading-none transition-opacity duration-300",
							selected
								? "border-primary bg-primary text-primary-foreground"
								: guideCells.has(cell)
									? "border-primary bg-primary/10 text-foreground"
									: "border-border bg-card text-foreground",
							path.length === 0 &&
								cell === guidePath[0] &&
								"quadrat-guide-start",
							// A tile the word used up dims once its light goes out.
							!complete && uses === 0 && !flashing && "opacity-30",
							!complete && clueStartCells.has(cell) && "clue-gradient-cell",
							flashing && "quadrat-found-cell",
						)}
						style={style}
					>
						{label}
						{!complete && uses > 0 ? (
							<span
								aria-hidden
								className={cn(
									"absolute top-[10%] right-[13%] text-[0.4em] font-semibold tabular-nums leading-none",
									flashing
										? "opacity-80"
										: selected
											? "text-primary-foreground/80"
											: "text-muted-foreground",
								)}
							>
								{uses}
							</span>
						) : null}
					</div>
				);
			})}
		</fieldset>
	);
}
