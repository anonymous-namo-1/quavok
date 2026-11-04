// Cashfree webhook receiver (deploy with --no-verify-jwt). Verifies
// x-webhook-signature = base64(HMAC_SHA256(x-webhook-timestamp + rawBody, CASHFREE_SECRET_KEY)).
import { createClient } from "jsr:@supabase/supabase-js@2";

async function valid(raw: string, ts: string, sig: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("CASHFREE_SECRET_KEY")!),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + raw)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== sig.length) return false;
  let diff = 0; for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 && Math.abs(Date.now() / 1000 - Number(ts) / (ts.length > 11 ? 1000 : 1)) < 600;
}

Deno.serve(async (req) => {
  const raw = await req.text();
  const ts = req.headers.get("x-webhook-timestamp") ?? "", sig = req.headers.get("x-webhook-signature") ?? "";
  if (!(await valid(raw, ts, sig))) return new Response("bad signature", { status: 401 });
  const ev = JSON.parse(raw), type: string = ev.type ?? "", d = ev.data ?? {};
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await db.from("webhook_events").insert({ event_type: type, payload: ev });

  const nextInvoice = async (user_id: string, amount_paise: number, payment_id: string) => {
    const { count } = await db.from("invoices").select("*", { count: "exact", head: true });
    await db.from("invoices").upsert({ user_id, amount_paise, payment_id,
      number: `QV/2026-27/${String((count ?? 0) + 1).padStart(3, "0")}` }, { onConflict: "number" });
  };

  if (type.startsWith("PAYMENT_SUCCESS") && d.order?.order_id) {           // one-time order
    const { data: p } = await db.from("payments").update({ status: "PAID", raw: d }).eq("id", d.order.order_id).select().single();
    if (p?.user_id) await nextInvoice(p.user_id, p.amount_paise, p.id);
  } else if (type.startsWith("PAYMENT_FAILED") && d.order?.order_id) {
    await db.from("payments").update({ status: "FAILED", raw: d }).eq("id", d.order.order_id);
  } else if (type === "SUBSCRIPTION_STATUS_CHANGED") {
    const s = d.subscription_details ?? d;
    await db.from("subscriptions").update({ status: s.subscription_status, updated_at: new Date().toISOString(),
      next_charge_date: s.next_schedule_date?.slice(0, 10) ?? null }).eq("id", s.subscription_id);
  } else if (type === "SUBSCRIPTION_PAYMENT_SUCCESS" || type === "SUBSCRIPTION_PAYMENT_FAILED") {
    const ok = type.endsWith("SUCCESS"), subId = d.subscription_id, pid = String(d.cf_payment_id ?? d.payment_id ?? `${subId}_${Date.now()}`);
    const { data: s } = await db.from("subscriptions").select("*").eq("id", subId).single();
    if (s) {
      await db.from("payments").upsert({ id: pid, user_id: s.user_id, subscription_id: subId, kind: "subscription",
        plan_key: s.plan_key, amount_paise: Math.round((d.payment_amount ?? s.amount_paise / 100) * 100), status: ok ? "PAID" : "FAILED", raw: d });
      if (ok && (d.payment_type ?? "CHARGE") !== "AUTH") await nextInvoice(s.user_id, s.amount_paise, pid);
    }
  }
  return new Response("ok");
});
