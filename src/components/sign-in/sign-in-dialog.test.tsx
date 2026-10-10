// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import type { SignInMethod } from "@/lib/sign-in-methods";
import { SignInDialog, SignInDialogBody } from "./sign-in-dialog";
import { openSignIn, setSignInOpen } from "./sign-in-store";

const authClient = vi.hoisted(() => ({
	signIn: { social: vi.fn(), emailOtp: vi.fn() },
	emailOtp: { sendVerificationOtp: vi.fn() },
}));

const captureException = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-client", () => ({ authClient }));
vi.mock("@sentry/tanstackstart-react", () => ({ captureException }));
vi.mock("@tanstack/react-router", () => ({
	getRouteApi: () => ({
		useLoaderData: () => ({ signInMethods: ["email"] }),
	}),
}));
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
				<SignInDialogBody methods={methods} onVerifyingChange={() => {}} />
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
	setSignInOpen(false);
	vi.clearAllMocks();
});

async function reachCodeStep() {
	fireEvent.change(screen.getByLabelText("Adreça de correu"), {
		target: { value: "laia@example.cat" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Envia'm un codi" }));
	await screen.findByText("Escriu el codi");
}

describe("SignInDialogBody", () => {
	it("offers only the methods the server enabled", () => {
		renderBody(["google"]);

		expect(screen.getByRole("button", { name: /Google/ })).toBeTruthy();
		expect(screen.queryByLabelText("Adreça de correu")).toBeNull();
		cleanup();

		renderBody(["email"]);

		expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
		expect(screen.getByLabelText("Adreça de correu")).toBeTruthy();
	});

	it("starts Google sign-in back to the current page", async () => {
		renderBody(["google", "email"]);

		fireEvent.click(screen.getByRole("button", { name: /Google/ }));

		await waitFor(() => {
			expect(authClient.signIn.social).toHaveBeenCalledWith({
				provider: "google",
				callbackURL: window.location.href,
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

	it("reports a failure the player could not have caused", async () => {
		const networkError = new Error("Failed to fetch");
		authClient.emailOtp.sendVerificationOtp.mockRejectedValueOnce(networkError);
		renderBody(["email"]);

		fireEvent.change(screen.getByLabelText("Adreça de correu"), {
			target: { value: "laia@example.cat" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Envia'm un codi" }));

		await screen.findByRole("alert");
		expect(captureException).toHaveBeenCalledWith(networkError);

		authClient.emailOtp.sendVerificationOtp.mockResolvedValueOnce({
			data: null,
			error: { status: 500 },
		});
		fireEvent.click(screen.getByRole("button", { name: "Envia'm un codi" }));

		await waitFor(() => expect(captureException).toHaveBeenCalledTimes(2));
	});

	it("leaves a wrong code out of error reports", async () => {
		authClient.signIn.emailOtp.mockResolvedValue({
			data: null,
			error: { code: "INVALID_OTP", status: 400 },
		});
		renderBody(["email"]);
		await reachCodeStep();

		fireEvent.change(screen.getByLabelText("Codi"), {
			target: { value: "000000" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Entra" }));

		await screen.findByRole("alert");
		expect(captureException).not.toHaveBeenCalled();
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

describe("SignInDialog", () => {
	it("stays open on Escape while a code is being checked", async () => {
		let failVerify: (result: unknown) => void = () => {};
		authClient.signIn.emailOtp.mockReturnValue(
			new Promise((resolve) => {
				failVerify = resolve;
			}),
		);
		render(<SignInDialog />);
		act(() => openSignIn());
		await reachCodeStep();

		fireEvent.change(screen.getByLabelText("Codi"), {
			target: { value: "000000" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Entra" }));
		await screen.findByRole("button", { name: "Entrant..." });

		fireEvent.keyDown(document.activeElement ?? document.body, {
			key: "Escape",
		});
		expect(screen.getByRole("alertdialog")).toBeTruthy();

		await act(async () => {
			failVerify({ data: null, error: { code: "INVALID_OTP", status: 400 } });
		});
		expect(screen.getByRole("alert").textContent).toBe(
			"El codi no és correcte.",
		);

		fireEvent.keyDown(document.activeElement ?? document.body, {
			key: "Escape",
		});
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
	});
});
