import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 120;
const ANIMATION_DURATION_MS = 4500;
const PALETTE = [
	"#fbbf24", // amber
	"#34d399", // emerald
	"#60a5fa", // blue
	"#f472b6", // pink
	"#a78bfa", // purple
	"#fb923c", // orange
	"#f87171", // red
	"#4ade80", // green
];

type Particle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	rotation: number;
	rotationSpeed: number;
	w: number;
	h: number;
	color: string;
	isCircle: boolean;
};

export function DailyConfetti({ fire }: { fire: boolean }) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		if (!fire) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Respect reduced-motion preference
		if (
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;

		const particles: Particle[] = Array.from(
			{ length: PARTICLE_COUNT },
			() => ({
				x: Math.random() * canvas.width,
				y: Math.random() * -150 - 10,
				vx: (Math.random() - 0.5) * 4,
				vy: 1.5 + Math.random() * 4,
				rotation: Math.random() * Math.PI * 2,
				rotationSpeed: (Math.random() - 0.5) * 0.15,
				w: 6 + Math.random() * 8,
				h: 5 + Math.random() * 5,
				color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
				isCircle: Math.random() < 0.25,
			}),
		);

		const startTime = performance.now();
		let frameId: number;

		const draw = (now: number) => {
			const elapsed = now - startTime;
			const t = elapsed / ANIMATION_DURATION_MS;

			if (t >= 1) {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				return;
			}

			// Start fading out at 65% of animation duration
			const globalAlpha = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;

			ctx.clearRect(0, 0, canvas.width, canvas.height);

			for (const p of particles) {
				p.vy += 0.06; // gentle gravity
				p.vx *= 0.995; // slight air resistance
				p.x += p.vx;
				p.y += p.vy;
				p.rotation += p.rotationSpeed;

				// Skip pieces that have fallen off screen
				if (p.y > canvas.height + 20) continue;

				ctx.save();
				ctx.globalAlpha = globalAlpha;
				ctx.fillStyle = p.color;
				ctx.translate(p.x, p.y);
				ctx.rotate(p.rotation);

				if (p.isCircle) {
					ctx.beginPath();
					ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
					ctx.fill();
				} else {
					ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
				}

				ctx.restore();
			}

			frameId = requestAnimationFrame(draw);
		};

		frameId = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(frameId);
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		};
	}, [fire]);

	if (!fire) return null;

	return (
		<canvas
			ref={canvasRef}
			className="fixed inset-0 pointer-events-none z-50"
		/>
	);
}
