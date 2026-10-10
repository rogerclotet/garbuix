import { expect, it } from "vitest";
import { findIncompatibleStatements } from "./migration-compatibility";

function check(sql: string, schemaChanged = true) {
	return findIncompatibleStatements([{ file: "drizzle/0001_test.sql", sql }], {
		schemaChanged,
	});
}

it("accepts changes the previous release cannot notice", () => {
	const findings = check(`CREATE TABLE "guesses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id");--> statement-breakpoint
CREATE UNIQUE INDEX "guesses_user_uidx" ON "guesses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_name_idx" ON "user" USING btree ("name");--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "image" DROP NOT NULL;--> statement-breakpoint
UPDATE "user" SET "nickname" = "name";`);
	expect(findings).toEqual([]);
});

it.each([
	[`ALTER TABLE "user" ADD COLUMN "nickname" text NOT NULL;`, "do not supply"],
	[`ALTER TABLE "user" ALTER COLUMN "image" SET NOT NULL;`, "without"],
	[`ALTER TABLE "user" ALTER COLUMN "age" SET DATA TYPE bigint;`, "old type"],
	[`ALTER TABLE "user" RENAME COLUMN "name" TO "full_name";`, "old name"],
	[`ALTER TABLE "user" RENAME TO "player";`, "old name"],
	[
		`ALTER TABLE "user" ADD CONSTRAINT "age_check" CHECK ("age" > 0);`,
		"constraint",
	],
	[
		`CREATE UNIQUE INDEX "user_name_uidx" ON "user" USING btree ("name");`,
		"unique index",
	],
	[`TRUNCATE "user";`, "not known to be safe"],
])("rejects %s", (sql, reason) => {
	const findings = check(sql, false);
	expect(findings).toHaveLength(1);
	expect(findings[0].reason).toContain(reason);
});

it.each([
	`ALTER TABLE "user" DROP COLUMN "nickname";`,
	`DROP TABLE "guesses" CASCADE;`,
	`DROP INDEX "user_name_uidx";`,
	`ALTER TABLE "user" DROP CONSTRAINT "age_check";`,
])(
	"allows %s only once the previous release's schema has dropped it",
	(sql) => {
		expect(check(sql, true)).toHaveLength(1);
		expect(check(sql, false)).toEqual([]);
	},
);

it("accepts a statement with a written exception, but not an empty one", () => {
	const statement = `ALTER TABLE "user" ALTER COLUMN "image" SET NOT NULL;`;
	expect(
		check(
			`-- safe-with-previous-release: every insert has set image since #140\n${statement}`,
		),
	).toEqual([]);
	expect(check(`-- safe-with-previous-release:\n${statement}`)).toHaveLength(1);
});

it("points at the line of the offending statement", () => {
	const findings =
		check(`ALTER TABLE "user" ADD COLUMN "nickname" text;--> statement-breakpoint
-- a hand-written note
ALTER TABLE "user" DROP COLUMN "name";`);
	expect(findings).toMatchObject([
		{ file: "drizzle/0001_test.sql", line: 3, statement: /DROP COLUMN "name"/ },
	]);
});
