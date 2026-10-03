import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const BASE_URL = 'https://api.marubox.jp/v1';

const MAX_PAGE_SIZE = 100;

type Context = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

interface ApiErrorBody {
	error?: { code?: string; message?: string };
}

/**
 * Pulls the `{ error: { code, message } }` envelope out of whatever shape the
 * HTTP helper used for the failed response, so the n8n UI shows the API's own
 * explanation (for example "slot_unavailable: that time is not available").
 */
function apiErrorMessage(error: unknown): string | undefined {
	const e = error as {
		response?: { body?: unknown; data?: unknown };
		cause?: { response?: { body?: unknown; data?: unknown } };
		context?: { data?: unknown };
	};
	const candidates = [
		e?.context?.data,
		e?.response?.body,
		e?.response?.data,
		e?.cause?.response?.body,
		e?.cause?.response?.data,
	];
	for (const candidate of candidates) {
		let body = candidate;
		if (typeof body === 'string') {
			try {
				body = JSON.parse(body);
			} catch {
				body = undefined;
			}
		}
		const apiError = (body as ApiErrorBody | undefined)?.error;
		if (apiError?.message) {
			return apiError.code ? `${apiError.code}: ${apiError.message}` : apiError.message;
		}
	}
	return undefined;
}

/** HTTP status of a failed request, across the error shapes n8n's helpers produce. */
export function errorStatus(error: unknown): number | undefined {
	const e = error as {
		httpCode?: string | number;
		statusCode?: number;
		status?: number;
		response?: { status?: number; statusCode?: number };
		cause?: { response?: { status?: number; statusCode?: number }; status?: number };
	};
	const raw =
		e?.httpCode ??
		e?.statusCode ??
		e?.status ??
		e?.response?.status ??
		e?.response?.statusCode ??
		e?.cause?.response?.status ??
		e?.cause?.status;
	const status = Number(raw);
	return Number.isFinite(status) ? status : undefined;
}

export async function businessBoxApiRequest(
	this: Context,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs: IDataObject = {},
	headers: IDataObject = {},
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${path}`,
		qs,
		headers: { Accept: 'application/json', ...headers },
		json: true,
	};
	if (body !== undefined) options.body = body;

	try {
		const response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'businessBoxApi',
			options,
		)) as IDataObject | undefined;
		return response ?? {};
	} catch (error) {
		throw toNodeApiError.call(this, error);
	}
}

/**
 * Wraps a failed request in a NodeApiError whose description is the API's own
 * explanation. n8n's HTTP helper may already have wrapped it; wrapping again
 * returns that same error, so the description is set on it either way.
 */
function toNodeApiError(this: Context, error: unknown): NodeApiError {
	const apiError = new NodeApiError(this.getNode(), error as JsonObject);
	const message = apiErrorMessage(error);
	if (message) apiError.description = message;
	return apiError;
}

/**
 * Like businessBoxApiRequest, but resolves to null on 404 instead of failing.
 * Webhook lifecycle methods use it, where "already gone" is a normal answer.
 */
export async function businessBoxApiRequestUnlessNotFound(
	this: Context,
	method: IHttpRequestMethods,
	path: string,
): Promise<IDataObject | null> {
	try {
		const response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'businessBoxApi',
			{ method, url: `${BASE_URL}${path}`, headers: { Accept: 'application/json' }, json: true },
		)) as IDataObject | undefined;
		return response ?? {};
	} catch (error) {
		if (errorStatus(error) === 404) return null;
		throw toNodeApiError.call(this, error);
	}
}

/**
 * Follows `nextCursor` until the API has no more pages, or until `limit`
 * items have been collected when a limit is given.
 */
export async function businessBoxApiRequestAllItems(
	this: Context,
	path: string,
	qs: IDataObject = {},
	limit?: number,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let cursor: string | null | undefined;

	do {
		const remaining = limit === undefined ? MAX_PAGE_SIZE : limit - items.length;
		const query: IDataObject = { ...qs, limit: Math.min(MAX_PAGE_SIZE, remaining) };
		if (cursor) query.cursor = cursor;

		const page = await businessBoxApiRequest.call(this, 'GET', path, undefined, query);
		items.push(...((page.items as IDataObject[] | undefined) ?? []));
		cursor = page.nextCursor as string | null | undefined;
	} while (cursor && (limit === undefined || items.length < limit));

	return limit === undefined ? items : items.slice(0, limit);
}

export async function getEventTypeOptions(
	this: ILoadOptionsFunctions,
	includeInactive: boolean,
): Promise<INodePropertyOptions[]> {
	const eventTypes = await businessBoxApiRequestAllItems.call(this, '/event-types', {
		active: includeInactive ? 'false' : 'true',
	});
	return eventTypes.map((eventType) => {
		const minutes = eventType.durationMinutes as number | undefined;
		const notes = [
			minutes ? `${minutes} min` : '',
			eventType.active === false ? 'inactive' : '',
		].filter(Boolean);
		return {
			name: `${eventType.name as string}${notes.length ? ` (${notes.join(', ')})` : ''}`,
			value: eventType.id as string,
			description: (eventType.description as string | null) ?? undefined,
		};
	});
}
