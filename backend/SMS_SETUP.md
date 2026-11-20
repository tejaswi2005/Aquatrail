# SMS and live tracking setup

## SMS

The backend uses Twilio's Messages REST API. Configure the server-only values in
`.env` using `.env.example` as a reference:

- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- Either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`
- `PUBLIC_APP_URL` for the customer tracking link
- For India, set `TWILIO_REQUIRE_DLT=true` and configure the DLT entity ID and
  approved template ID for each notification type.

Twilio lists SMS support for India through international and domestic gateways
in its [India messaging guidelines](https://www.twilio.com/en-us/guidelines/in/sms).
For domestic delivery, its guide requires company and sender ID registration on
the operators' DLT portals before registration with Twilio, and supports
DLT-registered alphanumeric sender IDs. Before production, complete the current
DLT entity, sender ID, and approved template process with the provider; each
generated message must match the approved template. `TWILIO_REQUIRE_DLT=true`
prevents sending until the entity and per-event template IDs are configured.
Confirm the current account and destination route requirements with Twilio.

The `Notification` table stores event identifiers, status, timestamps, and
provider reference only; it does not store message content or phone numbers.
The event key is unique, so duplicate business requests do not submit duplicate
messages. The current API does not expose owner endpoints to inspect or retry
failed SMS requests.

`SENT` means Twilio accepted the API request and returned a provider reference;
it does not assert handset delivery. Provider delivery receipts are not
configured. A failed request can be retried by an owner after correcting its
configuration or customer data.

## Live driver tracking

Socket.IO location events are authorized against the authenticated customer or
the delivery's assigned driver. Publishing is accepted only while the delivery
is `STARTED`. The server retains only the latest in-memory point for up to
90 seconds; completion, cancellation, or a driver stop clears it and notifies
subscribers. GPS samples are not written to PostgreSQL.

The browser sends an update after moving at least 25 meters or after 15 seconds.
Customer tracking refreshes delivery status and hides locations older than 90
seconds. HTTPS (or localhost during development) and customer/driver browser
location permission are required.
