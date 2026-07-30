export const DISPLAY_NAME_MAX_LENGTH = 48;
const DISPLAY_NAME_LOCALE = "ca";

export type UserProfileFields = {
	name: string;
	displayName?: string | null;
	image?: string | null;
	useGoogleAvatar?: boolean;
};

export function resolveDisplayName(profile: UserProfileFields): string {
	const custom = profile.displayName?.trim();
	if (custom) {
		return normalizeDisplayNameInput(custom) ?? custom;
	}
	return profile.name.trim() || "Convidat";
}

export function resolveAvatarImage(profile: UserProfileFields): string | null {
	if (profile.useGoogleAvatar === false) {
		return null;
	}
	return profile.image ?? null;
}

export function initialsFromName(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 0) return "?";
	const first = parts[0]?.[0] ?? "";
	const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
	return `${first}${last}`.toUpperCase() || "?";
}

function sanitizeDisplayNameRaw(value: string): string {
	return value
		.replace(/[\u200b-\u200d\ufeff]/g, "")
		.replace(/\s+/g, " ")
		.replace(/[^\p{L}\p{M}\p{N} '.-]/gu, "")
		.replace(/\s+/g, " ")
		.trim();
}

function capitalizeNameSegment(segment: string): string {
	if (!segment) {
		return segment;
	}
	const lower = segment.toLocaleLowerCase(DISPLAY_NAME_LOCALE);
	return (
		lower.charAt(0).toLocaleUpperCase(DISPLAY_NAME_LOCALE) + lower.slice(1)
	);
}

function capitalizeNameWord(word: string): string {
	return word
		.split("-")
		.map((part) =>
			part
				.split("'")
				.map((segment) => capitalizeNameSegment(segment))
				.join("'"),
		)
		.join("-");
}

export function capitalizeDisplayName(value: string): string {
	return value
		.split(" ")
		.filter(Boolean)
		.map((word) => capitalizeNameWord(word))
		.join(" ");
}

export function normalizeDisplayNameInput(value: string): string | null {
	const sanitized = sanitizeDisplayNameRaw(value);
	if (!sanitized || sanitized.length > DISPLAY_NAME_MAX_LENGTH) {
		return null;
	}

	const capitalized = capitalizeDisplayName(sanitized);
	if (!capitalized || !/\p{L}/u.test(capitalized)) {
		return null;
	}

	return capitalized;
}
