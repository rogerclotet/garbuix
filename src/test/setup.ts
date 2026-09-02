import { vi } from "vitest";

// jsdom does not implement layout APIs; Daily flying-letter animations call these.
// https://github.com/jsdom/jsdom/issues/3002
function createDomRect(): DOMRect {
	const rect = {
		x: 0,
		y: 0,
		width: 0,
		height: 0,
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		toJSON: () => rect,
	};
	return rect as DOMRect;
}

class FakeDOMRectList extends Array<DOMRect> implements DOMRectList {
	item(index: number): DOMRect | null {
		return this[index] ?? null;
	}
}

const getBoundingClientRect = vi.fn(() => createDomRect());
const getClientRects = vi.fn(() => new FakeDOMRectList());

if (typeof HTMLElement !== "undefined") {
	HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
	HTMLElement.prototype.getClientRects = getClientRects;
}

if (typeof Range !== "undefined") {
	Range.prototype.getBoundingClientRect = getBoundingClientRect;
	Range.prototype.getClientRects = getClientRects;
}
