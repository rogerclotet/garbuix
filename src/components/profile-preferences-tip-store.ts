import { createBooleanStore } from "@/lib/boolean-store";

const store = createBooleanStore();

export const openProfilePreferencesTip = store.open;
export const closeProfilePreferencesTip = store.close;
export const setProfilePreferencesTipOpen = store.set;
export const useProfilePreferencesTipOpen = store.useValue;
