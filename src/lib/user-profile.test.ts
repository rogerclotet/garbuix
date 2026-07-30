import { describe, expect, it } from "vitest";
import {
	capitalizeDisplayName,
	initialsFromName,
	normalizeDisplayNameInput,
	resolveAvatarImage,
	resolveDisplayName,
} from "@/lib/user-profile";

describe("user-profile", () => {
	it("prefers a custom display name over the OAuth name", () => {
		expect(
			resolveDisplayName({
				name: "Google Name",
				displayName: "Custom Name",
			}),
		).toBe("Custom Name");
	});

	it("falls back to the OAuth name when no custom name is set", () => {
		expect(
			resolveDisplayName({
				name: "Google Name",
				displayName: null,
			}),
		).toBe("Google Name");
	});

	it("normalizes stored display names when resolving them", () => {
		expect(
			resolveDisplayName({
				name: "Google Name",
				displayName: "  roger   clotet  ",
			}),
		).toBe("Roger Clotet");
	});

	it("hides the Google avatar when initials are preferred", () => {
		expect(
			resolveAvatarImage({
				name: "Ada Lovelace",
				image: "https://example.com/photo.jpg",
				useGoogleAvatar: false,
			}),
		).toBeNull();
	});

	it("shows the Google avatar when enabled", () => {
		expect(
			resolveAvatarImage({
				name: "Ada Lovelace",
				image: "https://example.com/photo.jpg",
				useGoogleAvatar: true,
			}),
		).toBe("https://example.com/photo.jpg");
	});

	it("builds initials from the visible name", () => {
		expect(initialsFromName("Ada Lovelace")).toBe("AL");
	});

	it("rejects empty or overlong display names", () => {
		expect(normalizeDisplayNameInput("")).toBeNull();
		expect(normalizeDisplayNameInput("   ")).toBeNull();
		expect(normalizeDisplayNameInput("a".repeat(49))).toBeNull();
		expect(normalizeDisplayNameInput("Valid Name")).toBe("Valid Name");
	});

	it("trims, collapses whitespace, and title-cases display names", () => {
		expect(normalizeDisplayNameInput("  roger   clotet  ")).toBe(
			"Roger Clotet",
		);
		expect(normalizeDisplayNameInput("MARIA-ÀNGELS")).toBe("Maria-Àngels");
	});

	it("removes unsupported characters", () => {
		expect(normalizeDisplayNameInput("bad<script>name")).toBe("Badscriptname");
		expect(normalizeDisplayNameInput("hello\nworld")).toBe("Hello World");
	});

	it("requires at least one letter", () => {
		expect(normalizeDisplayNameInput("12345")).toBeNull();
	});

	it("title-cases hyphenated and apostrophe names", () => {
		expect(capitalizeDisplayName("anna-maria d'arco")).toBe(
			"Anna-Maria D'Arco",
		);
	});
});
