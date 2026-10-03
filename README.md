# n8n-nodes-business-box

This is an n8n community node package for [Business Box](https://marubox.jp/), the online booking app for appointments, lessons and consultations. It lets your n8n workflows create, find and cancel bookings, check free times, send single-use booking links, and start a workflow whenever a booking changes.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Trigger](#trigger)
- [Usage notes](#usage-notes)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

In short: in n8n, open **Settings → Community nodes → Install**, enter `n8n-nodes-business-box`, and confirm.

## Credentials

The nodes authenticate with a Business Box API key.

1. Sign in to Business Box at [app.marubox.jp](https://app.marubox.jp/login).
2. Go to **Settings → Integrations → API keys and webhooks** and create a key. Name it (for example "n8n") and choose what it may do:
   - **Read only** is enough for Get and Get Many operations.
   - **Read and write** is needed to create or cancel bookings, create invite links, and for the trigger node, which registers a webhook.
3. Copy the key, which starts with `bbk_`. It is shown only once.
4. In n8n, create a **Business Box API** credential and paste the key into **API Key**.

n8n tests the credential by calling `GET /me`, which returns the account the key belongs to and its scopes. You can revoke a key in the same place at any time.

## Operations

The **Business Box** node supports these resources and operations. It can also be used as a tool by n8n AI agents.

| Resource | Operation | What it does |
|---|---|---|
| Account | Get | Returns the account the API key belongs to, its booking page URL, plan and key scopes |
| Booking | Create | Books a time for a customer, exactly as adding a booking in the app does. The customer is emailed a confirmation unless you turn it off. No card payment is taken. A time that is no longer free fails with `slot_unavailable`: the API never double-books |
| Booking | Get | Returns one booking by ID |
| Booking | Get Many | Lists bookings, with filters for status, event type, customer email, start time range and last update, and a choice of sort order. Supports Return All |
| Booking | Cancel | Cancels a booking, with an optional message to the customer. The customer is emailed and a paid booking is refunded in full. Cancelling an already-cancelled booking returns it unchanged |
| Event Type | Get Many | Lists the things people can book, optionally including inactive ones. Supports Return All |
| Event Type | Get Available Slots | Returns the free start times for an event type between two dates (up to 31 days), after availability, calendar conflicts, buffers, notice and daily limits are applied. Output is one item per slot, or a single item with the list |
| Invite Link | Create | Creates a booking link that works once and then stops, optionally pre-filled with the invitee's name and email and expiring after 1 to 90 days. Useful for replying to an enquiry |

Event type fields are dropdowns loaded from your account, or you can pass an ID with an expression.

## Trigger

The **Business Box Trigger** node starts a workflow when one of these events happens:

- Booking created
- Booking rescheduled
- Booking cancelled
- Booking marked no-show
- Booking completed
- All events (including event types added later)

When the workflow is activated, the node registers a webhook with Business Box (shown in the app with the description "n8n") and removes it when the workflow is deactivated.

Every delivery is signed. The node checks the `BB-Signature` header (`t=<unix time>,v1=<HMAC-SHA256 of "<t>.<body>">`, keyed with the webhook's secret) and rejects deliveries with a missing or wrong signature, or a timestamp more than five minutes away, with HTTP 401. Verified deliveries output the event body:

```json
{
  "id": "evt_…",
  "type": "booking.created",
  "createdAt": "2026-10-02T03:15:00.000Z",
  "apiVersion": "v1",
  "data": { "…": "the booking" }
}
```

## Usage notes

- **Times.** The API works in UTC. A date-time picked in n8n without an offset is read in the workflow's time zone and converted; an expression such as `{{ $json.start }}` with an offset or `Z` is used as is. Slot ranges use whole days in the workflow's time zone.
- **No double bookings on retries.** Booking Create and Invite Link Create send an `Idempotency-Key`. If you leave the field empty, the key is derived from the execution, node, item and request body, so "Retry on fail" replays the first result instead of creating a second booking. Set your own key to deduplicate across executions (keys are remembered for 24 hours).
- **Booking statuses.** Get Many leaves out `held` and `awaiting_payment` bookings unless you ask for them in the Status filter, because they are still in progress.
- **Money** is an integer in the currency's minor units. JPY has no minor unit, so `5000` is ¥5,000.

## Compatibility

Built with `@n8n/node-cli` 0.50 against `n8n-workflow` 2.x. It needs an n8n version that supports light and dark node icons and `usableAsTool` (n8n 1.x releases from 2025 onwards, and 2.x). Requires Node.js 20.15 or later.

## Resources

- [Business Box](https://marubox.jp/)
- [Business Box developer documentation](https://marubox.jp/developers/)
- [Business Box API reference (OpenAPI)](https://api.marubox.jp/v1/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Source code and issues](https://github.com/marubox/n8n-nodes-business-box)

## License

[MIT](LICENSE) © App Dev Plus G.K.
