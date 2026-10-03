/**
 * Date helpers. The API takes instants as ISO 8601 UTC with a trailing `Z`,
 * and slot ranges as plain `YYYY-MM-DD` dates. n8n's date picker produces a
 * local wall-clock time with no offset (for example `2026-10-05T10:00:00`),
 * meant in the workflow's time zone, while expressions usually produce a full
 * ISO string with an offset. Both are accepted here.
 */

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/;

/** Offset of `timeZone` from UTC at the instant `utcMs`, in milliseconds. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(new Date(utcMs));
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second'),
	);
	return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Returns an ISO 8601 UTC string (`...Z`), or undefined if `value` is not a date. */
export function toUtcIso(value: unknown, timeZone: string): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (value instanceof Date) return value.toISOString();

	const text = String(value).trim();
	if (HAS_ZONE.test(text)) {
		const date = new Date(text);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	const m = LOCAL.exec(text);
	if (!m) {
		const date = new Date(text);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}
	const wallClock = Date.UTC(
		Number(m[1]),
		Number(m[2]) - 1,
		Number(m[3]),
		Number(m[4] ?? 0),
		Number(m[5] ?? 0),
		Number(m[6] ?? 0),
		Number((m[7] ?? '0').padEnd(3, '0')),
	);
	// Two passes so a time near a daylight saving change lands on the right offset.
	let utc = wallClock - zoneOffsetMs(wallClock, timeZone);
	utc = wallClock - zoneOffsetMs(utc, timeZone);
	return new Date(utc).toISOString();
}

/** Returns `YYYY-MM-DD` for `value` as seen in `timeZone`. */
export function toDateOnly(value: unknown, timeZone: string): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const text = value instanceof Date ? value.toISOString() : String(value).trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
	if (!HAS_ZONE.test(text)) {
		const m = LOCAL.exec(text);
		if (m) return `${m[1]}-${m[2]}-${m[3]}`;
	}
	const date = new Date(text);
	if (Number.isNaN(date.getTime())) return undefined;
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(date);
}
