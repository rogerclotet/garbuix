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
		sizes: "120x120",
		href: "/icons/apple-icon-120.png",
	},
	{
		rel: "apple-touch-icon",
		sizes: "152x152",
		href: "/icons/apple-icon-152.png",
	},
	{
		rel: "apple-touch-icon",
		sizes: "167x167",
		href: "/icons/apple-icon-167.png",
	},
	{
		rel: "apple-touch-icon",
		sizes: "180x180",
		href: "/icons/apple-icon-180.png",
	},
] satisfies AnyRouteMatch["links"];
