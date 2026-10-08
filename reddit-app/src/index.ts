import {
	context,
	createServer,
	getServerPort,
	media,
	reddit,
	redis,
	type TaskResponse,
} from "@devvit/web/server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { type DailyPostDeps, postDailyPuzzle } from "./daily-post";

function toPostId(id: string): `t3_${string}` {
	if (!id.startsWith("t3_")) {
		throw new Error(`Expected a post id (t3_...), got ${id}`);
	}
	return id as `t3_${string}`;
}

function getSubredditName(): string {
	const { subredditName } = context;
	if (!subredditName) {
		throw new Error("Scheduled task ran without a subreddit in context");
	}
	return subredditName;
}

const deps: DailyPostDeps = {
	now: () => new Date(),
	fetch: (url) => fetch(url),
	store: {
		get: (key) => redis.get(key),
		set: async (key, value, ttlSeconds) => {
			if (ttlSeconds === undefined) {
				await redis.set(key, value);
				return;
			}
			await redis.set(key, value, {
				expiration: new Date(Date.now() + ttlSeconds * 1000),
			});
		},
		acquire: async (key, ttlSeconds) => {
			const count = await redis.incrBy(key, 1);
			if (count !== 1) return false;
			await redis.expire(key, ttlSeconds);
			return true;
		},
	},
	uploadImage: async (dataUrl) => {
		const asset = await media.upload({ url: dataUrl, type: "image" });
		return asset.mediaUrl;
	},
	submitPost: async (title, imageUrl) => {
		const post = await reddit.submitPost({
			subredditName: getSubredditName(),
			title,
			kind: "image",
			imageUrls: [imageUrl],
		});
		return post.id;
	},
	pinPost: async (postId) => {
		const post = await reddit.getPostById(toPostId(postId));
		await post.sticky();
	},
	unpinPost: async (postId) => {
		const post = await reddit.getPostById(toPostId(postId));
		await post.unsticky();
	},
};

const app = new Hono();

app.post("/internal/scheduler/post-daily-puzzle", async (c) => {
	const outcome = await postDailyPuzzle(deps);
	if (outcome.status === "posted") {
		console.log(`Posted ${outcome.dateKey} as ${outcome.postId}`);
	}
	return c.json<TaskResponse>({ status: "ok" }, 200);
});

app.onError((error, c) => {
	console.error("Daily puzzle post failed:", error);
	return c.json({ status: "error", message: error.message }, 500);
});

serve({
	fetch: app.fetch,
	createServer,
	port: getServerPort(),
});
