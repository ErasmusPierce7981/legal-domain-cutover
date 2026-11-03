import test from "node:test";
import assert from "node:assert/strict";
import { cutoverMatter } from "./domain_cutover.ts";

test("cutover carries the storefront matter into signed delivery follow-up", async () => {
  const calls: Array<[string, string, unknown?]> = [];
  const fake = {
    domainAdd: async (domain: string) => { calls.push(["domainAdd", domain]); return { zone_id: "zone-7" }; },
    recordUpsert: async (body: unknown) => { calls.push(["recordUpsert", "/v1/dns/record/upsert", body]); return {}; },
    domainVerify: async (domain: string) => { calls.push(["domainVerify", domain]); return {}; },
    registerWebhook: async (url: string) => { calls.push(["registerWebhook", url]); return { webhook_id: "wh-9" }; }
  };
  const result = await cutoverMatter({ domain: "firm.example", webhookUrl: "https://shop.test/hook", signedDocumentId: "signed-1", deadlineDays: 5 }, fake as never);
  assert.equal(result.zone_id, "zone-7");
  assert.equal(result.follow_up_after_days, 5);
  assert.deepEqual(calls[1], ["recordUpsert", "/v1/dns/record/upsert", { zone_id: "zone-7", record_type: "CNAME", name: "app", content: "storefront.example", ttl: 300 }]);
  assert.equal(calls[3][2], undefined);
});
