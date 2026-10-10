import { describe, expect, it } from "vitest";
import anonNameWords from "@/data/anon-name-words.json";
import {
	EMAIL_CODE_SIGN_IN_PATH,
	resolveNewUserProfile,
} from "@/lib/new-user-profile";

const animalNames = new Set(anonNameWords.animals.map((animal) => animal.name));

function isGeneratedName(name: string) {
	return [...animalNames].some((animal) => name.startsWith(`${animal} `));
}

describe("resolveNewUserProfile", () => {
	it("keeps the name and photo Google shares", () => {
		expect(
			resolveNewUserProfile({
				name: "Laia Puig",
				image: "https://example.com/laia.png",
				path: "/callback/google",
			}),
		).toEqual({ name: "Laia Puig", image: "https://example.com/laia.png" });
	});

	it("generates an animal name if Google shares none", () => {
		const profile = resolveNewUserProfile({
			name: "  ",
			image: undefined,
			path: "/callback/google",
		});

		expect(isGeneratedName(profile.name)).toBe(true);
		expect(profile.image).toBeNull();
	});

	it("sanitizes the guest name and drops the photo sent with an email code", () => {
		expect(
			resolveNewUserProfile({
				name: "  guineu   astuta 🦊 ",
				image: "https://evil.example/tracker.png",
				path: EMAIL_CODE_SIGN_IN_PATH,
			}),
		).toEqual({ name: "Guineu Astuta", image: null });
	});

	it("falls back to a generated name when the email-code name is unusable", () => {
		const profile = resolveNewUserProfile({
			name: "!!!",
			image: null,
			path: EMAIL_CODE_SIGN_IN_PATH,
		});

		expect(isGeneratedName(profile.name)).toBe(true);
	});
});
