// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import type { SignInMethod } from "@/lib/sign-in-methods";
import { SignInDialogBody } from "./sign-in-dialog";

const authClient = vi.hoisted(() => ({
	signIn: { social: vi.fn(), emailOtp: vi.fn() },
	emailOtp: { sendVerificationOtp: vi.fn() },
}));

vi.mock("@/lib/auth-client", () => ({ authClient }));
vi.mock("@/lib/anon-identity", () => ({
	getOrCreateAnonIdentity: () => ({
		deviceId: "device",
		name: "Guineu astuta",
	}),
}));

function renderBody(methods: SignInMethod[]) {
	render(
		<AlertDialog open>
			<AlertDialogContent>
				<SignInDialogBody methods={methods} />
			</AlertDialogContent>
		</AlertDialog>,
	);
}

beforeEach(() => {
	authClient.signIn.social.mockResolvedValue({ data: {}, error: null });
	authClient.signIn.emailOtp.mockResolvedValue({ data: {}, error: null });
	authClient.emailOtp.sendVerificationOtp.mockResolvedValue({
		data: { success: true },
		error: null,
	});
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("SignInDialogBody", () => {
	it("offers only the methods the server enabled", () => {
		renderBody(["google", "reddit"]);

		expect(screen.getByRole("button", { name: /Google/ })).toBeTruthy();
		expect(screen.getByRole("button", { name: /Reddit/ })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Apple/ })).toBeNull();
		expect(screen.queryByLabelText("Adreça de correu")).toBeNull();
	});

	it("starts a provider sign-in carrying the guest name", async () => {
		renderBody(["google", "apple", "reddit", "email"]);

		fireEvent.click(screen.getByRole("button", { name: /Apple/ }));

		await waitFor(() => {
			expect(authClient.signIn.social).toHaveBeenCalledWith({
				provider: "apple",
				callbackURL: window.location.href,
				additionalData: { guestName: "Guineu astuta" },
			});
		});
	});

	it("sends a code, then signs in with it under the guest name", async () => {
		const reload = vi.fn();
		const originalLocation = window.location;
		Object.defineProperty(window, "location", {
			configurable: true,
			value: { ...originalLocation, reload },
		});
		try {
			renderBody(["email"]);

			fireEvent.change(screen.getByLabelText("Adreça de correu"), {
				target: { value: " laia@example.cat " },
			});
			fireEvent.click(screen.getByRole("button", { name: "Envia'm un codi" }));

			await screen.findByText("Escriu el codi");
			expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({
				email: "laia@example.cat",
				type: "sign-in",
			});

			fireEvent.change(screen.getByLabelText("Codi"), {
				target: { value: "48 29-13" },
			});
			fireEvent.click(screen.getByRole("button", { name: "Entra" }));

			await waitFor(() => expect(reload).toHaveBeenCalledOnce());
			expect(authClient.signIn.emailOtp).toHaveBeenCalledWith({
				email: "laia@example.cat",
				otp: "482913",
				name: "Guineu astuta",
			});
		} finally {
			Object.defineProperty(window, "location", {
				configurable: true,
				value: originalLocation,
			});
		}
	});

	it("explains a wrong code and stays on the code step", async () => {
		authClient.signIn.emailOtp.mockResolvedValue({
			data: null,
			error: { code: "INVALID_OTP", status: 400 },
		});
		renderBody(["email"]);

		fireEvent.change(screen.getByLabelText("Adreça de correu"), {
			target: { value: "laia@example.cat" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Envia'm un codi" }));
		await screen.findByText("Escriu el codi");

		fireEvent.change(screen.getByLabelText("Codi"), {
			target: { value: "000000" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Entra" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"El codi no és correcte.",
		);
	});

	it("explains when too many codes were requested", async () => {
		authClient.emailOtp.sendVerificationOtp.mockResolvedValue({
			data: null,
			error: { status: 429 },
		});
		renderBody(["email"]);

		fireEvent.change(screen.getByLabelText("Adreça de correu"), {
			target: { value: "laia@example.cat" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Envia'm un codi" }));

		expect((await screen.findByRole("alert")).textContent).toContain(
			"massa codis",
		);
		expect(screen.queryByText("Escriu el codi")).toBeNull();
	});
});
