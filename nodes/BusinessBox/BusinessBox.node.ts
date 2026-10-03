import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { createHash } from 'crypto';

import { bookingFields, bookingOperations } from './descriptions/BookingDescription';
import { eventTypeFields, eventTypeOperations } from './descriptions/EventTypeDescription';
import { inviteFields, inviteOperations } from './descriptions/InviteDescription';
import { toDateOnly, toUtcIso } from './shared/dates';
import {
	businessBoxApiRequest,
	businessBoxApiRequestAllItems,
	getEventTypeOptions,
} from './shared/transport';

/**
 * Programmatic rather than declarative: list operations follow an opaque
 * cursor, create operations send an Idempotency-Key derived from the
 * execution, and date pickers need converting to UTC instants and plain dates
 * in the workflow time zone. None of that maps onto routing alone.
 */
export class BusinessBox implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Business Box',
		name: 'businessBox',
		icon: {
			light: 'file:../../icons/businessBox.svg',
			dark: 'file:../../icons/businessBox.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create and manage bookings in Business Box',
		defaults: {
			name: 'Business Box',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'businessBoxApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Booking', value: 'booking' },
					{ name: 'Event Type', value: 'eventType' },
					{ name: 'Invite Link', value: 'invite' },
				],
				default: 'booking',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get the account the API key belongs to',
						action: 'Get the account',
					},
				],
				default: 'get',
			},
			...bookingOperations,
			...bookingFields,
			...eventTypeOperations,
			...eventTypeFields,
			...inviteOperations,
			...inviteFields,
		],
	};

	methods = {
		loadOptions: {
			async getEventTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getEventTypeOptions.call(this, false);
			},
			async getAllEventTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getEventTypeOptions.call(this, true);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const timeZone = this.getTimezone();

		// A retry of the same item in the same execution reuses the key, so the API
		// replays the first result instead of booking twice. The body hash keeps
		// keys distinct when a loop runs this node again with different data.
		const idempotencyKey = (i: number, explicit: unknown, body: IDataObject) => {
			if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
			const executionId = this.getExecutionId();
			if (!executionId) return undefined;
			const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
			const workflowId = this.getWorkflow().id ?? 'workflow';
			return `n8n:${workflowId}:${executionId}:${this.getNode().id}:${i}:${digest}`;
		};

		const push = (data: IDataObject | IDataObject[], i: number) => {
			const list = Array.isArray(data) ? data : [data];
			for (const json of list) returnData.push({ json, pairedItem: { item: i } });
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'account' && operation === 'get') {
					push(await businessBoxApiRequest.call(this, 'GET', '/me'), i);
				} else if (resource === 'booking') {
					if (operation === 'create') {
						const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const startRaw = this.getNodeParameter('start', i) as string;
						const start = toUtcIso(startRaw, timeZone);
						if (!start) {
							throw new NodeOperationError(this.getNode(), `Invalid start time: "${startRaw}"`, {
								itemIndex: i,
							});
						}
						const booker: IDataObject = {
							name: (this.getNodeParameter('bookerName', i) as string).trim(),
							email: (this.getNodeParameter('bookerEmail', i) as string).trim(),
							timezone: (additional.timezone as string | undefined)?.trim() || timeZone,
						};
						if (additional.locale) booker.locale = additional.locale;
						if (additional.phone) booker.phone = additional.phone;

						const body: IDataObject = {
							eventTypeId: this.getNodeParameter('eventTypeId', i) as string,
							start,
							booker,
						};
						if (additional.notes) body.notes = additional.notes;
						if (additional.notify !== undefined) body.notify = additional.notify;

						const key = idempotencyKey(i, additional.idempotencyKey, body);
						push(
							await businessBoxApiRequest.call(
								this,
								'POST',
								'/bookings',
								body,
								{},
								key ? { 'Idempotency-Key': key } : {},
							),
							i,
						);
					} else if (operation === 'get') {
						const id = encodeURIComponent(this.getNodeParameter('bookingId', i) as string);
						push(await businessBoxApiRequest.call(this, 'GET', `/bookings/${id}`), i);
					} else if (operation === 'cancel') {
						const id = encodeURIComponent(this.getNodeParameter('bookingId', i) as string);
						const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const body: IDataObject = {};
						if (additional.message) body.message = additional.message;
						push(await businessBoxApiRequest.call(this, 'POST', `/bookings/${id}/cancel`, body), i);
					} else if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
						const qs: IDataObject = {};
						const status = filters.status as string[] | undefined;
						if (status?.length) qs.status = status.join(',');
						if (filters.eventTypeId) qs.eventTypeId = filters.eventTypeId;
						if (filters.email) qs.email = (filters.email as string).trim();
						if (filters.sort) qs.sort = filters.sort;
						for (const field of ['startFrom', 'startTo', 'updatedSince']) {
							const value = toUtcIso(filters[field], timeZone);
							if (value) qs[field] = value;
						}
						push(await businessBoxApiRequestAllItems.call(this, '/bookings', qs, limit), i);
					} else {
						throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
							itemIndex: i,
						});
					}
				} else if (resource === 'eventType') {
					if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
						push(
							await businessBoxApiRequestAllItems.call(
								this,
								'/event-types',
								{ active: filters.includeInactive ? 'false' : 'true' },
								limit,
							),
							i,
						);
					} else if (operation === 'getSlots') {
						const eventTypeId = this.getNodeParameter('eventTypeId', i) as string;
						const from = toDateOnly(this.getNodeParameter('from', i), timeZone);
						const to = toDateOnly(this.getNodeParameter('to', i), timeZone);
						if (!from || !to) {
							throw new NodeOperationError(this.getNode(), 'From Date and To Date must be dates', {
								itemIndex: i,
							});
						}
						const options = this.getNodeParameter('options', i, {}) as IDataObject;
						const response = await businessBoxApiRequest.call(
							this,
							'GET',
							`/event-types/${encodeURIComponent(eventTypeId)}/slots`,
							undefined,
							{ from, to },
						);
						const slots = (response.slots as string[] | undefined) ?? [];
						if (options.output === 'single') {
							push({ eventTypeId, from, to, ...response }, i);
						} else {
							push(
								slots.map((slot) => ({
									eventTypeId,
									start: slot,
									calendarBlocked: response.calendarBlocked,
								})),
								i,
							);
						}
					} else {
						throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
							itemIndex: i,
						});
					}
				} else if (resource === 'invite' && operation === 'create') {
					const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
					const body: IDataObject = {
						eventTypeId: this.getNodeParameter('eventTypeId', i) as string,
					};
					if (additional.name) body.name = additional.name;
					if (additional.email) body.email = (additional.email as string).trim();
					if (additional.expiresInDays) body.expiresInDays = additional.expiresInDays;
					const key = idempotencyKey(i, additional.idempotencyKey, body);
					push(
						await businessBoxApiRequest.call(
							this,
							'POST',
							'/invites',
							body,
							{},
							key ? { 'Idempotency-Key': key } : {},
						),
						i,
					);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unknown resource and operation "${resource}: ${operation}"`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeApiError) {
					if (error.context.itemIndex === undefined) error.context.itemIndex = i;
					// Re-wrapping a NodeApiError hands back the same error.
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
