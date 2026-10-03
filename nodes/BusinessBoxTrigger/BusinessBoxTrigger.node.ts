import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { createHmac, timingSafeEqual } from 'crypto';

import {
	businessBoxApiRequest,
	businessBoxApiRequestAllItems,
	businessBoxApiRequestUnlessNotFound,
} from '../BusinessBox/shared/transport';

/** Deliveries signed more than this long ago (or ahead) are rejected as replays. */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

const ALL_EVENTS = '*';

interface StaticData extends IDataObject {
	webhookId?: string;
	webhookSecret?: string;
}

function requestedEvents(this: IHookFunctions): string[] {
	const events = this.getNodeParameter('events', []) as string[];
	return events.includes(ALL_EVENTS) ? [ALL_EVENTS] : [...events].sort();
}

function sameEvents(a: unknown, b: string[]): boolean {
	if (!Array.isArray(a)) return false;
	const left = [...(a as string[])].sort();
	return left.length === b.length && left.every((value, index) => value === b[index]);
}

/**
 * Verifies a `BB-Signature: t=<unix>,v1=<hex>` header: an HMAC-SHA256 of
 * `"<t>.<raw body>"` keyed with the subscription secret, the same scheme Stripe
 * uses. Several v1 values may be present while a secret is being rotated.
 */
export function verifySignature(
	header: string | undefined,
	rawBody: string,
	secret: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): 'ok' | 'invalid' | 'expired' {
	if (!header) return 'invalid';
	let timestamp: string | undefined;
	const signatures: string[] = [];
	for (const part of header.split(',')) {
		const index = part.indexOf('=');
		if (index < 0) continue;
		const key = part.slice(0, index).trim();
		const value = part.slice(index + 1).trim();
		if (key === 't') timestamp = value;
		else if (key === 'v1') signatures.push(value);
	}
	if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return 'invalid';

	const expected = Buffer.from(
		createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex'),
		'utf8',
	);
	const matches = signatures.some((signature) => {
		const given = Buffer.from(signature, 'utf8');
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
	if (!matches) return 'invalid';

	if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return 'expired';
	return 'ok';
}

export class BusinessBoxTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Business Box Trigger',
		name: 'businessBoxTrigger',
		icon: {
			light: 'file:../../icons/businessBox.svg',
			dark: 'file:../../icons/businessBox.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow when a booking is made, rescheduled, cancelled or completed in Business Box',
		defaults: {
			name: 'Business Box Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'businessBoxApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: [],
				options: [
					{
						name: 'All Events',
						value: ALL_EVENTS,
						description: 'Every event, including types added later',
					},
					{
						name: 'Booking Cancelled',
						value: 'booking.cancelled',
						description: 'A booking was cancelled by you or the customer',
					},
					{
						name: 'Booking Completed',
						value: 'booking.completed',
						description: 'A booking was marked as completed',
					},
					{
						name: 'Booking Created',
						value: 'booking.created',
						description: 'A new booking was confirmed',
					},
					{
						name: 'Booking Marked No-Show',
						value: 'booking.no_show',
						description: 'The customer did not turn up',
					},
					{
						name: 'Booking Rescheduled',
						value: 'booking.rescheduled',
						description: 'A booking was moved to a new time',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as StaticData;
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const events = requestedEvents.call(this);

				if (staticData.webhookId && staticData.webhookSecret) {
					const existing = await businessBoxApiRequestUnlessNotFound.call(
						this,
						'GET',
						`/webhooks/${encodeURIComponent(staticData.webhookId)}`,
					);
					if (!existing) {
						this.logger.info('Business Box webhook no longer exists; it will be recreated', {
							webhookId: staticData.webhookId,
						});
					}

					if (
						existing &&
						existing.url === webhookUrl &&
						existing.status === 'active' &&
						sameEvents(existing.events, events)
					) {
						return true;
					}

					// Gone, disabled after repeated failures, or subscribed to other
					// events: drop it so create() makes a fresh one with a new secret.
					if (existing) {
						await businessBoxApiRequestUnlessNotFound.call(
							this,
							'DELETE',
							`/webhooks/${encodeURIComponent(staticData.webhookId)}`,
						);
					}
					delete staticData.webhookId;
					delete staticData.webhookSecret;
				}

				// A subscription for this URL that we hold no secret for cannot be
				// verified, so it is useless: remove it rather than receive duplicates.
				const subscriptions = await businessBoxApiRequestAllItems.call(this, '/webhooks');
				for (const subscription of subscriptions) {
					if (subscription.url === webhookUrl) {
						await businessBoxApiRequest.call(
							this,
							'DELETE',
							`/webhooks/${encodeURIComponent(subscription.id as string)}`,
						);
					}
				}
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as StaticData;
				const webhookUrl = this.getNodeWebhookUrl('default') as string;

				const response = await businessBoxApiRequest.call(this, 'POST', '/webhooks', {
					url: webhookUrl,
					events: requestedEvents.call(this),
					description: 'n8n',
				});
				if (!response.id || !response.secret) return false;

				staticData.webhookId = response.id as string;
				staticData.webhookSecret = response.secret as string;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as StaticData;
				if (staticData.webhookId) {
					// The API answers 204 even for an unknown id; a 404 is treated the
					// same way, because "already gone" is the outcome we wanted.
					await businessBoxApiRequestUnlessNotFound.call(
						this,
						'DELETE',
						`/webhooks/${encodeURIComponent(staticData.webhookId)}`,
					);
				}
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const staticData = this.getWorkflowStaticData('node') as StaticData;
		const headers = this.getHeaderData() as IDataObject;

		const rawBody =
			(req as unknown as { rawBody?: Buffer | string }).rawBody?.toString() ??
			JSON.stringify(this.getBodyData());

		const secret = staticData.webhookSecret;
		const signature = headers['bb-signature'] as string | undefined;
		const verdict = secret ? verifySignature(signature, rawBody, secret) : 'invalid';

		if (verdict !== 'ok') {
			res
				.status(401)
				.json({
					error: verdict === 'expired' ? 'signature timestamp too old' : 'invalid signature',
				})
				.end();
			return { noWebhookResponse: true };
		}

		let body = this.getBodyData() as IDataObject;
		if (!body || Object.keys(body).length === 0) {
			body = JSON.parse(rawBody) as IDataObject;
		}

		return {
			workflowData: [this.helpers.returnJsonArray(body)],
		};
	}
}
