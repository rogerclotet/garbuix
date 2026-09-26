import { createServerFn } from "@tanstack/react-start";
import { ANALYTICS_EVENT, GAME_MODE } from "@/lib/analytics-events";
import {
	ensureMiniPuzzle,
	getMiniHistory,
	getMiniProgress,
	saveMiniProgress,
} from "@/lib/mini.server";
import { captureServerEvent } from "@/lib/observability-server";
import { getNextRolloverAt, getYesterdayDateKey } from "@/lib/puzzle-dates";
import { progressStateSchema } from "@/lib/puzzle-event-schemas";
import { getAuthSession } from "@/lib/puzzle-service.server";
import { toPuzzlePreview } from "@/lib/puzzle-snapshot";

export const getMiniPageData = createServerFn({ method: "GET" }).handler(
	async () => {
		const [row, session] = await Promise.all([
			ensureMiniPuzzle(),
			getAuthSession(),
		]);
		return {
			puzzle: row.publicSnapshotJson,
			progress: session ? await getMiniProgress(session.user.id, row.id) : null,
			userId: session?.user.id ?? null,
			rolloverAt: getNextRolloverAt().toISOString(),
		};
	},
);

export const syncMiniProgress = createServerFn({ method: "POST" })
	.inputValidator(progressStateSchema)
	.handler(async ({ data }) => {
		const session = await getAuthSession();
		if (!session) throw new Error("Unauthorized");
		return saveMiniProgress(session.user.id, data);
	});

export const getMiniHistoryData = createServerFn({ method: "GET" }).handler(
	async () => {
		const [yesterday, session] = await Promise.all([
			ensureMiniPuzzle(getYesterdayDateKey()),
			getAuthSession(),
		]);
		const entries = session ? await getMiniHistory(session.user.id) : [];
		captureServerEvent({
			event: ANALYTICS_EVENT.HISTORY_PAGE_LOADED_SERVER,
			distinctId: session?.user.id,
			properties: {
				game_mode: GAME_MODE.MINI,
				has_account_history: Boolean(session),
				history_entry_count: entries.length,
			},
		});
		return {
			userId: session?.user.id ?? null,
			entries,
			yesterdayPuzzle: {
				dateKey: yesterday.dateKey,
				preview: toPuzzlePreview(yesterday.privateSnapshotJson),
			},
		};
	},
);
