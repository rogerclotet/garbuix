const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(bytes).toString("base64");
	}

	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

function base64ToBytes(value: string) {
	if (typeof Buffer !== "undefined") {
		return new Uint8Array(Buffer.from(value, "base64"));
	}

	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

async function sha256Bytes(value: string) {
	return new Uint8Array(
		await crypto.subtle.digest("SHA-256", encoder.encode(value)),
	);
}

async function sha256Hex(value: string) {
	const digest = await sha256Bytes(value);
	return Array.from(digest)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export async function hashText(value: string) {
	return sha256Hex(value);
}

async function deriveKeyStream(secret: string, length: number) {
	const chunks: number[] = [];
	let counter = 0;

	while (chunks.length < length) {
		const digest = await sha256Bytes(`${secret}:${counter}`);
		chunks.push(...digest);
		counter += 1;
	}

	return new Uint8Array(chunks.slice(0, length));
}

async function xorSeal(value: string, secret: string) {
	const input = encoder.encode(value);
	const keyStream = await deriveKeyStream(secret, input.length);
	const encrypted = input.map((byte, index) => byte ^ keyStream[index]);
	return bytesToBase64(encrypted);
}

async function xorOpen(capsule: string, secret: string) {
	const input = base64ToBytes(capsule);
	const keyStream = await deriveKeyStream(secret, input.length);
	const decrypted = input.map((byte, index) => byte ^ keyStream[index]);
	return decoder.decode(decrypted);
}

export async function createGuessHash(
	puzzleId: string,
	normalizedGuess: string,
) {
	return sha256Hex(`${puzzleId}:guess:${normalizedGuess}`);
}

export async function createAnswerHash(
	slotSalt: string,
	normalizedGuess: string,
) {
	return sha256Hex(`${slotSalt}:check:${normalizedGuess}`);
}

export async function createUnlockToken(
	slotSalt: string,
	normalizedGuess: string,
) {
	return sha256Hex(`${slotSalt}:unlock:${normalizedGuess}`);
}

export async function sealAnswerCapsule(answer: string, unlockToken: string) {
	return xorSeal(answer, unlockToken);
}

export async function openAnswerCapsule(capsule: string, unlockToken: string) {
	return xorOpen(capsule, unlockToken);
}

export async function sealHintCapsule(
	letter: string,
	hintSalt: string,
	cellKey: string,
) {
	return xorSeal(letter, `${hintSalt}:${cellKey}`);
}

export async function openHintCapsule(
	capsule: string,
	hintSalt: string,
	cellKey: string,
) {
	return xorOpen(capsule, `${hintSalt}:${cellKey}`);
}
