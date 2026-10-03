import type { INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]) => ({ show: { resource: ['invite'], operation } });

export const inviteOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['invite'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a booking link that works once and then stops',
				action: 'Create an invite link',
			},
		],
		default: 'create',
	},
];

export const inviteFields: INodeProperties[] = [
	{
		displayName: 'Event Type Name or ID',
		name: 'eventTypeId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getEventTypes' },
		required: true,
		default: '',
		displayOptions: showFor(['create']),
		description:
			'Works for public and invite-only event types. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['create']),
		options: [
			{
				displayName: 'Expires In (Days)',
				name: 'expiresInDays',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 90 },
				default: 14,
				description: 'How long the link stays usable, from 1 to 90 days',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				description:
					'Sending the same key again within 24 hours returns the first link instead of creating another. If empty, a key is derived from this execution and item.',
			},
			{
				displayName: 'Invitee Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Pre-fills the booking form',
			},
			{
				displayName: 'Invitee Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Pre-fills the booking form',
			},
		],
	},
];
