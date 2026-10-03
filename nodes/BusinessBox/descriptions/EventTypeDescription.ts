import type { INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]) => ({ show: { resource: ['eventType'], operation } });

export const eventTypeOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['eventType'] } },
		options: [
			{
				name: 'Get Available Slots',
				value: 'getSlots',
				description: 'Get the free start times for an event type',
				action: 'Get available slots for an event type',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many event types',
				action: 'Get many event types',
			},
		],
		default: 'getAll',
	},
];

export const eventTypeFields: INodeProperties[] = [
	// ----------------------------------
	//         eventType: getAll
	// ----------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: showFor(['getAll']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: {
			show: { resource: ['eventType'], operation: ['getAll'], returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showFor(['getAll']),
		options: [
			{
				displayName: 'Include Inactive',
				name: 'includeInactive',
				type: 'boolean',
				default: false,
				description: 'Whether to include event types that are switched off',
			},
		],
	},

	// ----------------------------------
	//         eventType: getSlots
	// ----------------------------------
	{
		displayName: 'Event Type Name or ID',
		name: 'eventTypeId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getEventTypes' },
		required: true,
		default: '',
		displayOptions: showFor(['getSlots']),
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
	{
		displayName: 'From Date',
		name: 'from',
		type: 'dateTime',
		required: true,
		default: '',
		displayOptions: showFor(['getSlots']),
		description: 'First day to search, in the workflow time zone',
	},
	{
		displayName: 'To Date',
		name: 'to',
		type: 'dateTime',
		required: true,
		default: '',
		displayOptions: showFor(['getSlots']),
		description:
			'Last day to search, in the workflow time zone. The range can span at most 31 days.',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor(['getSlots']),
		options: [
			{
				displayName: 'Output',
				name: 'output',
				type: 'options',
				options: [
					{
						name: 'One Item per Slot',
						value: 'split',
						description: 'Each free start time becomes its own item',
					},
					{
						name: 'Single Item',
						value: 'single',
						description: 'One item holding the list of start times',
					},
				],
				default: 'split',
			},
		],
	},
];
