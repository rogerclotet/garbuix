import type { AnyRouteMatch } from "@tanstack/react-router";

export const links = [
	{
		rel: "manifest",
		href: "/manifest.json",
	},

	/* ---------- Favicon ---------- */
	{
		rel: "icon",
		type: "image/png",
		sizes: "196x196",
		href: "/icons/favicon-196.png",
	},

	/* ---------- Apple icons ---------- */
	{
		rel: "apple-touch-icon",
		href: "/icons/apple-icon-180.png",
	},
] satisfies AnyRouteMatch["links"];
