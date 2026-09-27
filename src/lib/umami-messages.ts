import { z } from "zod";
import { umamiEventName } from "@/lib/umami-events";

// Match Umami's /api/send limits. Unknown fields are stripped at the proxy.
const timing = z.number().nonnegative().max(60_000).optional();
export const umamiPerformancePayload = z
	.object({
		url: z.string(),
		lcp: timing,
		inp: timing,
		cls: z.number().nonnegative().max(100).optional(),
		fcp: timing,
		ttfb: timing,
	})
	.refine(({ lcp, inp, cls, fcp, ttfb }) =>
		[lcp, inp, cls, fcp, ttfb].some((value) => value !== undefined),
	);

export const umamiMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("event"),
		payload: z.object({
			url: z.string(),
			name: umamiEventName.optional(),
			data: z.record(z.string(), z.unknown()).optional(),
		}),
	}),
	z.object({
		type: z.literal("performance"),
		payload: umamiPerformancePayload,
	}),
]);

export type UmamiMessage = z.infer<typeof umamiMessageSchema>;
