const MADRID_TIME_ZONE = "Europe/Madrid";
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

function getDateParts(date: Date, timeZone = MADRID_TIME_ZONE) {
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const parts = formatter.formatToParts(date);
	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;

	if (!year || !month || !day) {
		throw new Error("Failed to format date parts");
	}

	return { year, month, day };
}

export function getDateKeyForDate(date: Date, timeZone = MADRID_TIME_ZONE) {
	const { year, month, day } = getDateParts(date, timeZone);
	return `${year}-${month}-${day}`;
}

export function getTodayDateKey(timeZone = MADRID_TIME_ZONE) {
	return getDateKeyForDate(new Date(), timeZone);
}

export function addDaysToDateKey(dateKey: string, days: number) {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return getDateKeyForDate(date, "UTC");
}

export function getTomorrowDateKey(timeZone = MADRID_TIME_ZONE) {
	return addDaysToDateKey(getTodayDateKey(timeZone), 1);
}

export function getYesterdayDateKey(timeZone = MADRID_TIME_ZONE) {
	return addDaysToDateKey(getTodayDateKey(timeZone), -1);
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A date key is only well-formed if it round-trips: the pattern alone accepts
// impossible dates like 2026-02-31, which Date silently rolls forward.
export function isValidDateKey(value: string): boolean {
	if (!DATE_KEY_PATTERN.test(value)) {
		return false;
	}

	const parsed = new Date(`${value}T12:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) {
		return false;
	}

	return getDateKeyForDate(parsed, "UTC") === value;
}

// Tomorrow's puzzle is pre-generated an hour before rollover, so it exists in
// the database well before anyone may play it. Requests must never reach a date
// past today, or a player could pull an unplayed board and solve it in advance.
export function isFutureDateKey(value: string, timeZone = MADRID_TIME_ZONE) {
	return value > getTodayDateKey(timeZone);
}

// The only date keys a request is allowed to name.
export function isPlayableDateKey(value: string, timeZone = MADRID_TIME_ZONE) {
	return isValidDateKey(value) && !isFutureDateKey(value, timeZone);
}

export function dateKeyToSeed(dateKey: string) {
	const [year, month, day] = dateKey.split("-").map((part) => Number(part));
	return (year - 2000) * 10000 + month * 100 + day;
}

export function seedToDateKey(seed: number) {
	const year = 2000 + Math.floor(seed / 10000);
	const month = Math.floor(seed / 100) % 100;
	const day = seed % 100;
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getNextRolloverAt(
	timeZone = MADRID_TIME_ZONE,
	referenceDate = new Date(),
) {
	const now = referenceDate;
	const currentDateKey = getDateKeyForDate(now, timeZone);
	let low = now.getTime();
	let high = low + 48 * 60 * 60 * 1000;

	while (high - low > 1_000) {
		const mid = Math.floor((low + high) / 2);
		const midDateKey = getDateKeyForDate(new Date(mid), timeZone);

		if (midDateKey === currentDateKey) {
			low = mid;
		} else {
			high = mid;
		}
	}

	return new Date(high);
}

export function getNextPregenerationAt(
	timeZone = MADRID_TIME_ZONE,
	referenceDate = new Date(),
	leadTimeMs = ONE_HOUR_IN_MS,
) {
	const nextRollover = getNextRolloverAt(timeZone, referenceDate);
	const pregenerationAt = new Date(nextRollover.getTime() - leadTimeMs);

	if (pregenerationAt.getTime() > referenceDate.getTime()) {
		return pregenerationAt;
	}

	const followingRollover = getNextRolloverAt(
		timeZone,
		new Date(nextRollover.getTime() + 1_000),
	);
	return new Date(followingRollover.getTime() - leadTimeMs);
}

export function isWithinPregenerationWindow(
	timeZone = MADRID_TIME_ZONE,
	referenceDate = new Date(),
	leadTimeMs = ONE_HOUR_IN_MS,
) {
	const nextRollover = getNextRolloverAt(timeZone, referenceDate);
	return nextRollover.getTime() - referenceDate.getTime() <= leadTimeMs;
}

export function getMadridTimeZone() {
	return MADRID_TIME_ZONE;
}

const madridTimeFormatter = new Intl.DateTimeFormat("ca-ES", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: MADRID_TIME_ZONE,
});

export function formatMadridTime(date: Date | string) {
	const value = typeof date === "string" ? new Date(date) : date;
	return madridTimeFormatter.format(value);
}
