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
  // Any DB error -> 500 so Cashfree retries instead of us silently dropping a payment update.
  const must = <T extends { error: unknown }>(r: T) => { if (r.error) throw r.error; return r; };
  try {
  must(await db.from("webhook_events").insert({ event_type: type, payload: ev }));

  const nextInvoice = async (user_id: string, amount_paise: number, payment_id: string) => {
    const { error } = await db.rpc("issue_invoice", { p_user: user_id, p_amount: amount_paise, p_payment: payment_id });
    if (error) throw error;
  };

  if (type.startsWith("PAYMENT_SUCCESS") && d.order?.order_id) {           // one-time order
    const { data: p } = must(await db.from("payments").update({ status: "PAID", raw: d }).eq("id", d.order.order_id).select().maybeSingle());
    if (p?.user_id) await nextInvoice(p.user_id, p.amount_paise, p.id);
  } else if (type.startsWith("PAYMENT_FAILED") && d.order?.order_id) {
    // Never downgrade: a late FAILED for an earlier attempt must not undo a PAID order.
    must(await db.from("payments").update({ status: "FAILED", raw: d }).eq("id", d.order.order_id).neq("status", "PAID"));
  } else if (type === "SUBSCRIPTION_STATUS_CHANGED") {
    const s = d.subscription_details ?? d;
    must(await db.from("subscriptions").update({ status: s.subscription_status, updated_at: new Date().toISOString(),
      next_charge_date: s.next_schedule_date?.slice(0, 10) ?? null }).eq("id", s.subscription_id));
  } else if (["SUBSCRIPTION_PAYMENT_SUCCESS", "SUBSCRIPTION_PAYMENT_FAILED", "SUBSCRIPTION_PAYMENT_CANCELLED"].includes(type)) {
    const ok = type.endsWith("SUCCESS"), subId = d.subscription_id;
    // Deterministic id so Cashfree retries of the same event hit the same row (and the same invoice).
    const pid = String(d.cf_payment_id ?? d.payment_id ?? `${subId}_${ev.event_time ?? ""}`);
    const { data: s } = must(await db.from("subscriptions").select("*").eq("id", subId).maybeSingle());
    if (s) {
      const { data: prev } = must(await db.from("payments").select("status").eq("id", pid).maybeSingle());
      if (ok || prev?.status !== "PAID") {
        const amount = d.payment_amount != null ? Math.round(Number(d.payment_amount) * 100) : s.amount_paise;
        must(await db.from("payments").upsert({ id: pid, user_id: s.user_id, subscription_id: subId, kind: "subscription",
          plan_key: s.plan_key, amount_paise: amount, status: ok ? "PAID" : type.endsWith("CANCELLED") ? "CANCELLED" : "FAILED", raw: d }));
        if (ok && (d.payment_type ?? "CHARGE") !== "AUTH") await nextInvoice(s.user_id, amount, pid);
      }
    }
  }
  } catch (e) {
    console.error("webhook db error", e);
    return new Response("db error, retry", { status: 500 });
  }
  return new Response("ok");
});
