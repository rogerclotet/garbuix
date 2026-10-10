// Deploys apply migrations while the previous release still serves, so each
// statement has to leave that release's queries working. AGENTS.md has the rules
// this enforces.

export type Migration = { file: string; sql: string };

export type Finding = {
	file: string;
	line: number;
	statement: string;
	reason: string;
};

type Verdict =
	| { kind: "compatible" }
	| { kind: "removal" }
	| { kind: "incompatible"; reason: string };

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";
// A reviewed exception. The reason is for the reviewer; only its presence counts.
export const EXCEPTION_MARKER = "-- safe-with-previous-release:";

const COMPATIBLE: Verdict = { kind: "compatible" };
const REMOVAL: Verdict = { kind: "removal" };
const incompatible = (reason: string): Verdict => ({
	kind: "incompatible",
	reason,
});

const REMOVAL_REASON =
	"src/db changes in the same range, so the previous release may still query what this removes. Remove it from the Drizzle schema in an earlier PR and add this migration once that PR is deployed";

// Matches `"table"` and `"schema"."table"`, quoted or not, and captures the table.
const TABLE = String.raw`(?:"?[\w$]+"?\.)?"?([\w$]+)"?`;

function createdTable(statement: string): string | undefined {
	return statement.match(
		new RegExp(`^CREATE TABLE (?:IF NOT EXISTS )?${TABLE}`, "i"),
	)?.[1];
}

function classifyAlterTable(change: string): Verdict {
	if (/^ADD COLUMN\b/i.test(change)) {
		const requiresValue =
			/\bNOT NULL\b/i.test(change) && !/\b(DEFAULT|GENERATED)\b/i.test(change);
		return requiresValue
			? incompatible(
					"inserts from the previous release do not supply this column. Make it nullable or give it a default",
				)
			: COMPATIBLE;
	}
	if (/^ALTER COLUMN \S+ (DROP NOT NULL|SET DEFAULT)\b/i.test(change)) {
		return COMPATIBLE;
	}
	if (/^ALTER COLUMN \S+ SET NOT NULL\b/i.test(change)) {
		return incompatible(
			"the previous release may still insert rows without this column",
		);
	}
	if (/^ALTER COLUMN \S+ (SET DATA )?TYPE\b/i.test(change)) {
		return incompatible(
			"the previous release reads and writes the old type. Add a new column and remove the old one later",
		);
	}
	if (/^ALTER COLUMN \S+ DROP DEFAULT\b/i.test(change)) {
		return incompatible(
			"inserts from the previous release may rely on the default",
		);
	}
	if (/^ADD CONSTRAINT\b/i.test(change)) {
		return incompatible(
			"rows the previous release writes may violate the constraint",
		);
	}
	if (/^DROP (COLUMN|CONSTRAINT)\b/i.test(change)) return REMOVAL;
	if (/^RENAME\b/i.test(change)) {
		return incompatible(
			"the previous release still uses the old name. Add the new one and remove the old one later",
		);
	}
	return incompatible(
		"this change is not known to be safe for the previous release",
	);
}

function classify(statement: string, newTables: Set<string>): Verdict {
	if (createdTable(statement)) return COMPATIBLE;
	if (/^CREATE (TYPE|SCHEMA|SEQUENCE|EXTENSION)\b/i.test(statement)) {
		return COMPATIBLE;
	}
	if (/^CREATE INDEX\b/i.test(statement)) return COMPATIBLE;
	if (/^ALTER TYPE .+ ADD VALUE\b/i.test(statement)) return COMPATIBLE;
	// Backfills change rows, not what the previous release's queries can name.
	if (/^(UPDATE|INSERT INTO)\b/i.test(statement)) return COMPATIBLE;

	const uniqueIndexTable = statement.match(
		new RegExp(`^CREATE UNIQUE INDEX .+? ON ${TABLE}`, "i"),
	)?.[1];
	if (uniqueIndexTable) {
		return newTables.has(uniqueIndexTable)
			? COMPATIBLE
			: incompatible(
					"rows the previous release writes may violate the unique index",
				);
	}

	const alterTable = statement.match(
		new RegExp(`^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?${TABLE} (.+)$`, "is"),
	);
	if (alterTable) {
		// The previous release has no queries against a table it never had.
		return newTables.has(alterTable[1])
			? COMPATIBLE
			: classifyAlterTable(alterTable[2]);
	}

	if (/^DROP (TABLE|INDEX)\b/i.test(statement)) return REMOVAL;
	return incompatible(
		"this statement is not known to be safe for the previous release",
	);
}

type Statement = { text: string; line: number; excepted: boolean };

function parseStatements(sql: string): Statement[] {
	const statements: Statement[] = [];
	let line = 1;
	for (const chunk of sql.split(STATEMENT_BREAKPOINT)) {
		// One marker covers its whole chunk, so hand-written blocks need only one.
		const excepted = chunk
			.split("\n")
			.some((text) =>
				new RegExp(`^${EXCEPTION_MARKER}\\s*\\S`).test(text.trim()),
			);
		let chunkLine = line;
		for (const piece of chunk.split(/;[ \t]*(?:\n|$)/)) {
			const lines = piece.split("\n");
			const firstCodeLine = lines.findIndex(
				(text) => text.trim() !== "" && !text.trim().startsWith("--"),
			);
			if (firstCodeLine !== -1) {
				const text = lines
					.filter((codeLine) => !codeLine.trim().startsWith("--"))
					.join(" ")
					.replace(/\s+/g, " ")
					.trim();
				statements.push({ text, line: chunkLine + firstCodeLine, excepted });
			}
			chunkLine += lines.length;
		}
		line += chunk.split("\n").length - 1;
	}
	return statements;
}

// `schemaChanged` says whether the Drizzle schema differs from the previous
// release's. When it does not, that release already stopped naming whatever a
// removal drops, which is the second PR of the two-PR rule.
export function findIncompatibleStatements(
	migrations: Migration[],
	{ schemaChanged }: { schemaChanged: boolean },
): Finding[] {
	const parsed = migrations.map(({ file, sql }) => ({
		file,
		statements: parseStatements(sql),
	}));
	const newTables = new Set(
		parsed.flatMap(({ statements }) =>
			statements.flatMap(({ text }) => createdTable(text) ?? []),
		),
	);

	const findings: Finding[] = [];
	for (const { file, statements } of parsed) {
		for (const { text, line, excepted } of statements) {
			if (excepted) continue;
			const verdict = classify(text, newTables);
			if (verdict.kind === "compatible") continue;
			if (verdict.kind === "removal" && !schemaChanged) continue;
			findings.push({
				file,
				line,
				statement: text,
				reason: verdict.kind === "removal" ? REMOVAL_REASON : verdict.reason,
			});
		}
	}
	return findings;
}
