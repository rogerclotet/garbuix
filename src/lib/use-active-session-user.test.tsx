// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/puzzle-types";
import { useActiveSessionUser } from "@/lib/use-active-session-user";

type SessionState = {
	data: { user: { id: string; name: string; email: string } } | null;
	error: unknown;
	isPending: boolean;
};

let session: SessionState;

vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => session },
}));

const renderedUser: SessionUser = {
	id: "user-1",
	name: "Marta",
	displayName: null,
	email: "marta@example.com",
	image: null,
	googleImage: null,
	useGoogleAvatar: true,
};

beforeEach(() => {
	session = { data: null, error: null, isPending: true };
});

it("keeps the rendered user while the session read cannot reach the server", () => {
	session = {
		data: null,
		error: new TypeError("Failed to fetch"),
		isPending: false,
	};
	const { result } = renderHook(() => useActiveSessionUser(renderedUser));
	expect(result.current.activeUserId).toBe("user-1");
});

it("keeps the rendered user when the server fails to answer", () => {
	session = {
		data: null,
		error: { status: 502, statusText: "Bad Gateway" },
		isPending: false,
	};
	const { result } = renderHook(() => useActiveSessionUser(renderedUser));
	expect(result.current.activeUserId).toBe("user-1");
});

it("signs out when the server says there is no session", () => {
	session = { data: null, error: null, isPending: false };
	const { result } = renderHook(() => useActiveSessionUser(renderedUser));
	expect(result.current.activeUser).toBeNull();
});

it("signs out when the server rejects the session", () => {
	session = {
		data: null,
		error: { status: 401, statusText: "Unauthorized" },
		isPending: false,
	};
	const { result } = renderHook(() => useActiveSessionUser(renderedUser));
	expect(result.current.activeUser).toBeNull();
});
