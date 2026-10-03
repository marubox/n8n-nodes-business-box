import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BusinessBoxApi implements ICredentialType {
	name = 'businessBoxApi';

	displayName = 'Business Box API';

	icon: Icon = {
		light: 'file:../icons/businessBox.svg',
		dark: 'file:../icons/businessBox.dark.svg',
	};

	documentationUrl = 'https://github.com/marubox/n8n-nodes-business-box#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'bbk_...',
			description:
				'Create a key in Business Box under Settings → Integrations → API keys and webhooks. Choose Read and write to create bookings or use the trigger.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.marubox.jp/v1',
			url: '/me',
			method: 'GET',
		},
	};
}
