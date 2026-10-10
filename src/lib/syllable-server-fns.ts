import { createServerFn } from "@tanstack/react-start";
import { getNextRolloverAt, getYesterdayDateKey } from "@/lib/puzzle-dates";
import { progressStateSchema } from "@/lib/puzzle-event-schemas";
import { getAuthSession } from "@/lib/puzzle-service.server";
import { toPuzzlePreview } from "@/lib/puzzle-snapshot";
import {
	ensureSyllablePuzzle,
	getSyllableHistory,
	getSyllableProgress,
	saveSyllableProgress,
} from "@/lib/syllable.server";

export const getSyllablePageData = createServerFn({ method: "GET" }).handler(
	async () => {
		const [row, session] = await Promise.all([
			ensureSyllablePuzzle(),
			getAuthSession(),
		]);
		return {
			puzzle: row.publicSnapshotJson,
			progress: session
				? await getSyllableProgress(session.user.id, row.id)
				: null,
			userId: session?.user.id ?? null,
			rolloverAt: getNextRolloverAt().toISOString(),
		};
	},
);

export const syncSyllableProgress = createServerFn({ method: "POST" })
	.validator(progressStateSchema)
	.handler(async ({ data }) => {
		const session = await getAuthSession();
		if (!session) throw new Error("Unauthorized");
		return saveSyllableProgress(session.user.id, data);
	});

export const getSyllableHistoryData = createServerFn({ method: "GET" }).handler(
	async () => {
		const [yesterday, session] = await Promise.all([
			ensureSyllablePuzzle(getYesterdayDateKey()),
			getAuthSession(),
		]);
		const entries = session ? await getSyllableHistory(session.user.id) : [];
		return {
			userId: session?.user.id ?? null,
			entries,
			yesterdayPuzzle: {
				dateKey: yesterday.dateKey,
				preview: toPuzzlePreview({
					publicSnapshot: yesterday.publicSnapshotJson,
					privateSnapshot: yesterday.privateSnapshotJson,
				}),
			},
		};
	},
);
