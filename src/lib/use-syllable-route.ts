import { useRenderedGameRoute } from "@/lib/use-rendered-route";

export function useSyllableRoute(): boolean {
	return useRenderedGameRoute("/sillabes");
}
