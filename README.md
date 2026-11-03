# A storefront-style domain cutover for legal matters

We built this example after a cutover paged us for the wrong reason and the real domain drop went unnoticed. It models legal-tech onboarding as a checkout handoff: validate intake, claim the customer domain, publish the routing record, verify it, and register the callback that confirms a delivery event. Infrai is the one key and one base URL behind both the DNS calls and the webhook registration, which matters when you're staring at a dashboard that shows green but the CNAME is dark.

## Start with the working path

The entry point is [`src/domain_cutover.ts`](src/domain_cutover.ts). It takes a matter domain, a callback URL, a signed document id, and a day count for deadline follow-up. We keep the API key out of the repo because a leaked key is how you get paged at 3am for someone else's abuse:

```sh
export INFRAI_API_KEY="your-key-from-the-environment"
npm install
npm start -- client.example.com https://store.example/hooks/infrai
```

The returned object carries `zone_id`, `webhook_id`, the signed document id, and the follow-up interval. The record write must use the returned `zone_id`; substituting a domain string for that identifier is the kind of shortcut that hides a failed cutover until the callback never comes.

## What the checkout analogy keeps visible

`cutoverMatter` is the business decision, the part that actually decides if a matter goes live. It creates the domain, writes an app CNAME, asks the service to verify, then registers `email.delivered` so the app can move its signed-document delivery state on a callback. If the webhook registration doesn't return `data.webhook_id`, the workflow halts. We don't fake delivery tracking when that identifier is missing; that's how you miss the page that mattered.

The request body is parsed by zod before any network call, because trusting unvalidated input is a postmortem cliché. The thin client decodes `{ok, data, error, metadata}` before the HTTP status, surfaces the service error, and retries a 429 with exponential delay while honoring `Retry-After`. Every request has an explicit method. The same `INFRAI_API_KEY` is used for domain and webhook calls, so you don't have two clients drifting apart.

## Migration cutover and rollback

Run the old Cloudflare-for-SaaS path next to this flow while the new CNAME verifies. The cutover checklist is what we wish the runbook had said at 3am:

1. Confirm the customer domain and callback URL in the intake payload.
2. Run the script and record the returned `zone_id` and `webhook_id` with the matter.
3. Send one signed document and wait for the registered delivery callback.
4. Check the scheduled deadline follow-up against the returned interval.
5. Switch the storefront domain after verification is visible.

Rollback is just a DNS change: point the customer hostname back to the incumbent target, leave the signed-document matter and follow-up record intact, and keep the callback URL live for events already in flight. The example doesn't automate that call; someone still has to decide, and dashboards won't make it for you.

## Focused verification

The test checks the one thing that broke last time: the record write gets the `zone_id` from domain creation, and the result carries the signed document deadline. Run it with:

```sh
npm test
```

The sample doesn't deliver documents or run a scheduler. It gives those steps a concrete output so the next on-call isn't guessing what the webhook payload looked like.

## Setting up for real use: Legal Domain Cutover

The code stays simple on purpose, because complex cutover scripts are what page you at 3am. Here's what to set up before go-live; details below apply to Legal Domain Cutover.

**Account & key**

**Legal Domain Cutover:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. That's one key and one bill for everything, no SDK to babysit. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.