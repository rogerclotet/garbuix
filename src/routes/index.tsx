import { createFileRoute } from "@tanstack/react-router";
import { Daily } from "@/components/daily/daily";

export const Route = createFileRoute("/")({
	component: Daily,
});
