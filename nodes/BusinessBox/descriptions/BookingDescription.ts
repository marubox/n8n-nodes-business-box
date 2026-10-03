import type { INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]) => ({ show: { resource: ['booking'], operation } });

export const bookingOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['booking'] } },
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				description: 'Cancel a booking. The customer is emailed and a paid booking is refunded.',
				action: 'Cancel a booking',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Book a time on behalf of a customer',
				action: 'Create a booking',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a booking',
				action: 'Get a booking',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many bookings',
				action: 'Get many bookings',
			},
		],
		default: 'create',
	},
];

export const bookingFields: INodeProperties[] = [
	// ----------------------------------
	//         booking: get, cancel
	// ----------------------------------
	{
		displayName: 'Booking ID',
		name: 'bookingId',
		type: 'string',
		required: true,
		default: '',
		placeholder: '66f1c0ffee0123456789abcd',
		displayOptions: showFor(['get', 'cancel']),
		description: 'The ID of the booking',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['cancel']),
		options: [
			{
				displayName: 'Message to Customer',
				name: 'message',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Included in the cancellation email to the customer (up to 1000 characters)',
			},
		],
	},

	// ----------------------------------
	//         booking: create
	// ----------------------------------
	{
		displayName: 'Event Type Name or ID',
		name: 'eventTypeId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getEventTypes' },
		required: true,
		default: '',
		displayOptions: showFor(['create']),
		description:
			'The event type to book. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Start Time',
		name: 'start',
		type: 'dateTime',
		required: true,
		default: '',
		displayOptions: showFor(['create']),
		description:
			'When the booking starts. A time without an offset is read in the workflow time zone. Use Get Available Slots to find a free time.',
	},
	{
		displayName: 'Customer Name',
		name: 'bookerName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: showFor(['create']),
	},
	{
		displayName: 'Customer Email',
		name: 'bookerEmail',
		type: 'string',
		placeholder: 'name@email.com',
		required: true,
		default: '',
		displayOptions: showFor(['create']),
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
				displayName: 'Customer Language',
				name: 'locale',
				type: 'options',
				options: [
					{ name: 'English', value: 'en' },
					{ name: 'Japanese', value: 'ja' },
				],
				default: 'en',
				description: 'Language of the emails the customer receives',
			},
			{
				displayName: 'Customer Phone',
				name: 'phone',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Customer Time Zone',
				name: 'timezone',
				type: 'string',
				default: '',
				placeholder: 'Asia/Tokyo',
				description:
					'IANA time zone used to show times to the customer. Defaults to the workflow time zone.',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				description:
					'Sending the same key again within 24 hours returns the first booking instead of creating a second one. If empty, a key is derived from this execution and item, so a retry of the same execution never double-books.',
			},
			{
				displayName: 'Notes',
				name: 'notes',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Notes from the customer (up to 2000 characters)',
			},
			{
				displayName: 'Send Confirmation Email',
				name: 'notify',
				type: 'boolean',
				default: true,
				description: 'Whether to email the customer a confirmation',
			},
		],
	},

	// ----------------------------------
	//         booking: getAll
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
		displayOptions: { show: { resource: ['booking'], operation: ['getAll'], returnAll: [false] } },
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
				displayName: 'Customer Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
			},
			{
				displayName: 'Event Type Name or ID',
				name: 'eventTypeId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAllEventTypes' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Sort',
				name: 'sort',
				type: 'options',
				options: [
					{ name: 'Newest Created First', value: '-createdAt' },
					{ name: 'Recently Updated First', value: '-updatedAt' },
					{ name: 'Start Time, Earliest First', value: 'start' },
					{ name: 'Start Time, Latest First', value: '-start' },
				],
				default: '-createdAt',
			},
			{
				displayName: 'Start From',
				name: 'startFrom',
				type: 'dateTime',
				default: '',
				description: 'Only bookings starting at or after this time',
			},
			{
				displayName: 'Start To',
				name: 'startTo',
				type: 'dateTime',
				default: '',
				description: 'Only bookings starting before this time',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'multiOptions',
				options: [
					{ name: 'Awaiting Payment', value: 'awaiting_payment' },
					{ name: 'Cancelled', value: 'cancelled' },
					{ name: 'Completed', value: 'completed' },
					{ name: 'Confirmed', value: 'confirmed' },
					{ name: 'Held', value: 'held' },
					{ name: 'No-Show', value: 'no_show' },
				],
				default: [],
				description:
					'If none are chosen, held and awaiting-payment bookings are left out, because they are not yet bookings to act on',
			},
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description: 'Only bookings changed at or after this time',
			},
		],
	},
];
