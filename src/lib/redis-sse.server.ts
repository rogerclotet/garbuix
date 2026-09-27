import type { Redis } from "ioredis";
import { getRedisSub } from "@/lib/redis.server";

type MessageListener = (channel: string, message: string) => void;
type ChannelSubscription = {
	listeners: Set<MessageListener>;
	ready: Promise<unknown>;
};

const subscribers = new WeakMap<Redis, Map<string, ChannelSubscription>>();

function unsubscribeChannel({
	sub,
	subscriptions,
	channel,
	subscription,
}: {
	sub: Redis;
	subscriptions: Map<string, ChannelSubscription>;
	channel: string;
	subscription: ChannelSubscription;
}) {
	// Keep the empty entry until Redis acknowledges removal. If this fails
	// during an outage, the ready handler retries after auto-resubscription.
	void sub.unsubscribe(channel).then(
		() => {
			// A new viewer may have replaced the entry while this was pending.
			if (subscriptions.get(channel) === subscription) {
				subscriptions.delete(channel);
			}
		},
		(error: unknown) => {
			console.warn("[redis:sse] unsubscribe failed", error);
		},
	);
}

function subscribe(sub: Redis, channels: string[], listener: MessageListener) {
	let subscriptions = subscribers.get(sub);
	if (!subscriptions) {
		subscriptions = new Map();
		subscribers.set(sub, subscriptions);
		const byChannel = subscriptions;
		// One Redis listener per process, regardless of the number of SSE streams.
		sub.on("message", (channel: string, message: string) => {
			for (const callback of byChannel.get(channel)?.listeners ?? []) {
				callback(channel, message);
			}
		});
		// ioredis queues auto-resubscriptions before emitting ready. Use one
		// handler for all abandoned channels, without adding per-viewer listeners.
		sub.on("ready", () => {
			for (const [channel, subscription] of byChannel) {
				if (subscription.listeners.size === 0) {
					unsubscribeChannel({
						sub,
						subscriptions: byChannel,
						channel,
						subscription,
					});
				}
			}
		});
	}

	const byChannel = subscriptions;
	const uniqueChannels = [...new Set(channels)];
	const ready = uniqueChannels.map((channel) => {
		let subscription = byChannel.get(channel);
		if (!subscription || subscription.listeners.size === 0) {
			subscription = {
				listeners: new Set(),
				ready: sub.subscribe(channel),
			};
			byChannel.set(channel, subscription);
		}
		subscription.listeners.add(listener);
		return subscription.ready;
	});

	return {
		ready: Promise.all(ready),
		unsubscribe() {
			for (const channel of uniqueChannels) {
				const subscription = byChannel.get(channel);
				if (!subscription?.listeners.delete(listener)) continue;
				if (subscription.listeners.size > 0) continue;
				// Issue commands immediately so a new viewer's SUBSCRIBE follows
				// this UNSUBSCRIBE even when the previous command is still pending.
				unsubscribeChannel({
					sub,
					subscriptions: byChannel,
					channel,
					subscription,
				});
			}
		},
	};
}

type RedisSseOptions = {
	channels: string[];
	event: "update" | "message";
	snapshot: () => Promise<unknown>;
	fallbackSnapshot: unknown;
	logPrefix: string;
};

export function createRedisSseStream({
	channels,
	event,
	snapshot,
	fallbackSnapshot,
	logPrefix,
}: RedisSseOptions): ReadableStream<Uint8Array> {
	const sub = getRedisSub();
	const encoder = new TextEncoder();
	let closed = false;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let subscription: ReturnType<typeof subscribe> | undefined;

	const cleanup = () => {
		closed = true;
		clearInterval(heartbeat);
		subscription?.unsubscribe();
	};

	return new ReadableStream({
		async start(controller) {
			const send = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					cleanup();
				}
			};

			try {
				const data = await snapshot();
				send(`event: snapshot\ndata: ${JSON.stringify(data)}\n\n`);
			} catch (error) {
				if (closed) return;
				console.warn(`${logPrefix} initial snapshot failed`, error);
				send(`event: snapshot\ndata: ${JSON.stringify(fallbackSnapshot)}\n\n`);
			}
			if (closed) return;

			if (sub) {
				subscription = subscribe(sub, channels, (_channel, message) => {
					send(`event: ${event}\ndata: ${message}\n\n`);
				});
				try {
					await subscription.ready;
				} catch (error) {
					if (closed) return;
					console.warn(`${logPrefix} subscribe failed`, error);
					cleanup();
					// EventSource reconnects and fetches a fresh snapshot.
					controller.close();
					return;
				}
			}
			if (closed) return;

			heartbeat = setInterval(() => {
				send(`: keep-alive ${Date.now()}\n\n`);
			}, 25_000);
		},
		cancel: cleanup,
	});
}
