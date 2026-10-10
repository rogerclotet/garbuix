import { createServerFn } from "@tanstack/react-start";
import { enabledSignInMethods } from "@/lib/auth";
import type { SignInMethod } from "@/lib/sign-in-methods";

export const getSignInMethods = createServerFn({ method: "GET" }).handler(
	async (): Promise<SignInMethod[]> => enabledSignInMethods,
);
