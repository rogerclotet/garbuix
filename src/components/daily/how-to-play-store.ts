import { createBooleanStore } from "@/lib/boolean-store";

const store = createBooleanStore();

export const openHowToPlay = store.open;
export const closeHowToPlay = store.close;
export const setHowToPlayOpen = store.set;
export const useHowToPlayOpen = store.useValue;
