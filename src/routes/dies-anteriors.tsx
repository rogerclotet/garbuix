import { createFileRoute } from "@tanstack/react-router";
import { History } from "@/components/history/history";

export const Route = createFileRoute("/dies-anteriors")({
	component: History,
});
