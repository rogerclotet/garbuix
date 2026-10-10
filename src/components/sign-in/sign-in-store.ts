import { createBooleanStore } from "@/lib/boolean-store";

const store = createBooleanStore();

export const openSignIn = store.open;
export const setSignInOpen = store.set;
export const useSignInOpen = store.useValue;
