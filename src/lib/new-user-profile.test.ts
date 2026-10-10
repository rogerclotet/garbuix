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
	it("keeps the name and photo a provider shares", () => {
		expect(
			resolveNewUserProfile({
				name: "Laia Puig",
				image: "https://example.com/laia.png",
				path: "/callback/google",
				guestName: "Guineu astuta",
			}),
		).toEqual({ name: "Laia Puig", image: "https://example.com/laia.png" });
	});

	it("keeps the guest name when the provider shares none", () => {
		expect(
			resolveNewUserProfile({
				name: "",
				image: null,
				path: "/callback/apple",
				guestName: "guineu astuta",
			}),
		).toEqual({ name: "Guineu Astuta", image: null });
	});

	it("generates an animal name when there is no guest name either", () => {
		const profile = resolveNewUserProfile({
			name: "  ",
			image: undefined,
			path: "/callback/apple",
			guestName: undefined,
		});

		expect(isGeneratedName(profile.name)).toBe(true);
	});

	it("sanitizes the name and drops the photo sent with an email code", () => {
		expect(
			resolveNewUserProfile({
				name: "  guineu   astuta 🦊 ",
				image: "https://evil.example/tracker.png",
				path: EMAIL_CODE_SIGN_IN_PATH,
				guestName: undefined,
			}),
		).toEqual({ name: "Guineu Astuta", image: null });
	});

	it("falls back to a generated name when the email-code name is unusable", () => {
		const profile = resolveNewUserProfile({
			name: "!!!",
			image: null,
			path: EMAIL_CODE_SIGN_IN_PATH,
			guestName: undefined,
		});

		expect(isGeneratedName(profile.name)).toBe(true);
	});
});
