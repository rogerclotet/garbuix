import anonNameWords from "@/data/anon-name-words.json";

// A playful "animal + adjective" name, gendered to agree with the animal. Guests
// get one on their first visit, and accounts made with an emailed code, which
// carries no name, start from one too when the guest's own is unusable.
export function pickAnonName(): string {
	const { adjectives, animals } = anonNameWords;
	const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
	const animal = animals[Math.floor(Math.random() * animals.length)];
	if (!adjective || !animal) {
		return "Convidat";
	}
	const inflected = animal.gender === "f" ? adjective.fem : adjective.masc;
	return `${animal.name} ${inflected.toLowerCase()}`;
}
