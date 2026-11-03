import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const intakeSchema = z.object({
  domain: z.string().min(3),
  webhookUrl: z.string().url(),
  signedDocumentId: z.string().min(1),
  deadlineDays: z.number().int().positive()
});
export type Intake = z.infer<typeof intakeSchema>;

export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function cutoverMatter(input: unknown, client = new InfraiClient(process.env.INFRAI_API_KEY ?? "")) {
  const matter = intakeSchema.parse(input);
  const zone = await client.domainAdd(matter.domain);
  await client.recordUpsert({ zone_id: zone.zone_id, record_type: "CNAME", name: "app", content: "storefront.example", ttl: 300 });
  await client.domainVerify(matter.domain);
  const webhook = await client.registerWebhook(matter.webhookUrl);
  if (!webhook.webhook_id) throw new Error("Webhook registration did not return webhook_id");
  return {
    domain: matter.domain,
    zone_id: zone.zone_id,
    webhook_id: webhook.webhook_id,
    signed_document_id: matter.signedDocumentId,
    follow_up_after_days: matter.deadlineDays,
    next: "deliver signed document, then schedule deadline follow-up"
  };
}

if (import.meta.main) {
  const input = { domain: process.argv[2] ?? "client.example.com", webhookUrl: process.argv[3] ?? "https://shop.example/hooks/infrai", signedDocumentId: "matter-1042-signed", deadlineDays: 7 };
  cutoverMatter(input).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
