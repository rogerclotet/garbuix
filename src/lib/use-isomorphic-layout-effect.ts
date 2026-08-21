import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect runs before the browser paints, which is what lets a
// localStorage read replace a loading state without ever showing it. React
// warns when it is used during SSR, where it never runs anyway, so fall back to
// useEffect there to keep the render quiet.
export const useIsomorphicLayoutEffect =
	typeof window === "undefined" ? useEffect : useLayoutEffect;
