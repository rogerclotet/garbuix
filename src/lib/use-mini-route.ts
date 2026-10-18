import { useRenderedGame } from "@/lib/use-rendered-route";

export function useMiniRoute(): boolean {
	return useRenderedGame() === "mini";
}
