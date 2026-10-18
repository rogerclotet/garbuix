import { createBooleanStore } from "@/lib/boolean-store";

const store = createBooleanStore();

export const openQuadratTutorial = store.open;
export const setQuadratTutorialOpen = store.set;
export const useQuadratTutorialOpen = store.useValue;
