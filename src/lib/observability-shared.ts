import type { GlitchTipClientConfig } from "@/lib/glitchtip-config";

export type ObservabilityConfig = {
	glitchtip?: GlitchTipClientConfig;
	analyticsEnabled: boolean;
};
