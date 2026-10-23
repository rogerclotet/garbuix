import { resolveAnonSession, withAnonCookie } from "@/lib/anon-session.server";
import {
	consumeRateLimit,
	getClientAddress,
	tooManyRequests,
} from "@/lib/rate-limit.server";
import { guestProgressReportSchema } from "@/lib/usage-stats";
import { recordPuzzleUsage } from "@/lib/usage-stats.server";

// A guest's Mini, Síl·labes or Quadrat progress lives only in the browser, so
// this report (POST /api/guest-progress) is how the usage statistics count
// them, as the progress sync does for signed-in players. The server counts it
// and keeps nothing.
export async function handleGuestProgressReport(
	request: Request,
): Promise<Response> {
	const session = resolveAnonSession(request);
	// A guest reports at most a start and a finish per game and page load, so
	// both limits sit far above real play.
	const limits = await Promise.all([
		consumeRateLimit({
			key: `guest-progress:${session.deviceId}`,
			limit: 30,
			windowSeconds: 60,
		}),
		consumeRateLimit({
			key: `guest-progress:ip:${getClientAddress(request)}`,
			limit: 300,
			windowSeconds: 60,
		}),
	]);
	const exceeded = limits.find((limit) => !limit.allowed);
	if (exceeded) {
		return tooManyRequests(exceeded);
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return new Response("Invalid body", { status: 400 });
	}
	const result = guestProgressReportSchema.safeParse(raw);
	if (!result.success) {
		return new Response("Invalid body", { status: 400 });
	}

	const report = result.data;
	recordPuzzleUsage({
		game: report.game,
		dateKey: report.dateKey,
		player: { kind: "guest", id: session.deviceId },
		started: true,
		completed: report.completed,
	});
	return withAnonCookie(new Response(null, { status: 204 }), session.setCookie);
}
