import { describe, expect, it, vi } from "vitest";
import {
	buildSignInCodeEmail,
	createResendMailer,
} from "@/lib/sign-in-email.server";

describe("buildSignInCodeEmail", () => {
	it("puts the code in the subject and both bodies", () => {
		const email = buildSignInCodeEmail("482913");

		expect(email.subject).toContain("482913");
		expect(email.text).toContain("482913");
		expect(email.html).toContain("482913");
	});
});

describe("createResendMailer", () => {
	it("sends the code from the configured address", async () => {
		const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
		const send = createResendMailer({
			apiKey: "re_test",
			from: "Garbuix <codi@garbuix.app>",
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});

		await send("laia@example.cat", "482913");

		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe("https://api.resend.com/emails");
		expect(new Headers(init.headers).get("Authorization")).toBe(
			"Bearer re_test",
		);
		expect(JSON.parse(String(init.body))).toMatchObject({
			from: "Garbuix <codi@garbuix.app>",
			to: ["laia@example.cat"],
		});
	});

	it("fails without naming the recipient when Resend refuses", async () => {
		const send = createResendMailer({
			apiKey: "re_test",
			from: "Garbuix <codi@garbuix.app>",
			fetchImpl: (async () =>
				new Response("{}", { status: 422 })) as unknown as typeof fetch,
		});

		const error = await send("laia@example.cat", "482913").catch(
			(caught: unknown) => caught as Error,
		);

		expect(error).toBeInstanceOf(Error);
		expect(error?.message).toContain("422");
		expect(error?.message).not.toContain("laia@example.cat");
	});
});
