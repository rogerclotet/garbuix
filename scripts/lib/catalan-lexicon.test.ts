import { describe, expect, it } from "vitest";
import {
	buildCatalanLexicon,
	isGenerationCandidate,
	type LexiconWord,
} from "./catalan-lexicon";

// Real lines from Softcatalà's resultats/lt/diccionari.txt.
const DICTIONARY = `
pau pau_1 NCFS000
pau pau_2 NCMS000
ordre ordre_1 NCMS000
ordre ordre_2 NCFS000
cada cada DI0CS0
sense sense SPS00
ningú ningú PI0CS000
mentre mentre CS
català català AQ0MS0
catalana català AQ0FS0
catalans català AQ0MP0
petit petit AQ0MS0
petita petit AQ0FS0
noi noi NCMS000
noia noi NCFS000
noies noi NCFP000
casa casa NCFS000
cases casa NCFP000
cases casar VMIP2S00
menjar menjar VMN00000
menjo menjar VMIP1S0C
molta moldre VMP00SF0
aquest aquest DD0MS0
aquesta aquest DD0FS0
aquests aquest DD0MP0
nosaltres jo PP1CPN00
ella ell PP3FSN00
ells ell PP3MPN00
els ell PP3CP000
ens jo PP1CP000
vostè ell PP3CS00P
vostès ell PP3CP00P
ràpid ràpid AQ0MS0
ràpidament ràpidament RG
sempre sempre RG
hola hola I
km quilòmetre Y
Pau Pau NPMSSP0
Barcelona Barcelona NPFSG00
abans-d'ahir abans-d'ahir RG
`;

const LEMMA_FREQUENCIES = `
pau, 23456
ordre, 25708
cada, 89136
sense, 183545
ningú, 62969
mentre, 109708
català, 17000
petit, 60000
noi, 30000
casa, 90000
menjar, 20000
aquest, 555600
jo, 400000
ràpid, 9000
ràpidament, 11183
sempre, 120000
hola, 5140
`;

const FORM_FREQUENCIES = `
catalana, 17981
catalans, 9000
petita, 28280
noia, 36960
noies, 9000
cases, 15666
menjo, 423
molta, 5000
aquesta, 203301
aquests, 100000
nosaltres, 60000
ella, 150000
ells, 200000
els, 1400000
ens, 300000
vostè, 37000
vostès, 5000
`;

const lexicon = buildCatalanLexicon({
	dictionary: DICTIONARY,
	lemmaFrequencies: LEMMA_FREQUENCIES,
	formFrequencies: FORM_FREQUENCIES,
});

function find(name: string): LexiconWord | undefined {
	return lexicon.find((word) => word.name === name);
}

describe("buildCatalanLexicon", () => {
	it("merges numbered homographs into one word", () => {
		expect(find("pau")).toMatchObject({
			areatematica: "Nom",
			frequency: 23456,
		});
		expect(find("ordre")).toBeDefined();
		expect(lexicon.some((word) => word.name.includes("_"))).toBe(false);
	});

	it("accepts closed-class words", () => {
		expect(find("cada")?.areatematica).toBe("Determinant");
		expect(find("sense")?.areatematica).toBe("Preposició");
		expect(find("ningú")?.areatematica).toBe("Pronom");
		expect(find("mentre")?.areatematica).toBe("Conjunció");
		expect(find("nosaltres")?.areatematica).toBe("Pronom");
	});

	it("accepts singular personal pronouns, nosaltres and vosaltres only", () => {
		const pronouns = ["ella", "ells", "els", "ens", "vostè", "vostès"].filter(
			(name) => find(name) !== undefined,
		);
		expect(pronouns).toEqual(["ella", "vostè"]);
	});

	it("accepts feminine singulars by their own frequency", () => {
		expect(find("catalana")?.frequency).toBe(17981);
		expect(find("noia")?.frequency).toBe(36960);
		expect(find("aquesta")?.frequency).toBe(203301);
	});

	it("accepts -ment adverbs", () => {
		expect(find("ràpidament")?.areatematica).toBe("Adverbi");
	});

	it("leaves out plurals, verb forms, interjections, abbreviations and names", () => {
		for (const name of [
			"catalans",
			"noies",
			"cases",
			"aquests",
			"menjo",
			"molta",
			"hola",
			"km",
			"Pau",
			"barcelona",
			"abans-d'ahir",
		]) {
			expect(find(name), name).toBeUndefined();
		}
	});

	it("keeps generation to open-class headwords and feminine nouns", () => {
		const candidates = lexicon
			.filter(isGenerationCandidate)
			.map((word) => word.name)
			.sort();
		expect(candidates).toEqual([
			"casa",
			"català",
			"menjar",
			"noia",
			"ordre",
			"petit",
			"ràpid",
			"sempre",
		]);
		expect(find("noia")?.generationEligible).toBe(true);
		expect(find("petita")?.generationEligible).toBe(false);
		expect(find("ràpidament")?.generationEligible).toBe(false);
		expect(find("cada")?.generationEligible).toBe(false);
	});
});
