// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useObservability } from "@/lib/use-observability";

const identify = vi.fn();
const setPersonPropertiesForFlags = vi.fn();

vi.mock("@posthog/react", () => ({
	usePostHog: () => ({
		capture: vi.fn(),
		captureException: vi.fn(),
		identify,
		reset: vi.fn(),
		setPersonPropertiesForFlags,
	}),
}));

describe("useObservability", () => {
	it("overrides person properties for flags on identify, so an email-targeted flag doesn't have to wait for the identify event to be ingested server-side", () => {
		const { result } = renderHook(() => useObservability());

		result.current.identifyUser({
			email: "user@example.com",
			id: "user-1",
			image: null,
			name: "User",
		});

		const expectedProperties = {
			avatar: undefined,
			email: "user@example.com",
			name: "User",
		};
		expect(identify).toHaveBeenCalledWith("user-1", expectedProperties);
		expect(setPersonPropertiesForFlags).toHaveBeenCalledWith(
			expectedProperties,
		);
	});
});
