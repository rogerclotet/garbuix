import { useRenderedGameRoute } from "@/lib/use-rendered-route";

export function useMiniRoute(): boolean {
	return useRenderedGameRoute("/mini");
}
