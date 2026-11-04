// POST {plan} with the user's Supabase JWT -> returns payment_session_id (one-time)
// or subscription_session_id (monthly autopay). Secrets: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV, SITE_ORIGIN.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PLANS, cfBase, cfHeaders, cors } from "../_shared/plans.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: "sign in first" }, 401);
  const { plan } = await req.json().catch(() => ({}));
  const p = PLANS[plan];
  if (!p) return json({ error: "unknown plan" }, 400);
  const { data: cust } = await admin.from("customers").select("*").eq("id", user.id).single();
  if (!/^[6-9]\d{9}$/.test(cust?.phone ?? "")) return json({ error: "phone required" }, 400);
  const customer = {
    customer_id: user.id.replaceAll("-", ""), customer_email: user.email,
    customer_phone: cust.phone, customer_name: cust?.name || user.email,
  };
  const origin = Deno.env.get("SITE_ORIGIN") ?? "https://quavok.com";
  const id = `qv_${plan}_${Date.now()}`;

  if (!p.recurring) {
    const r = await fetch(`${cfBase()}/orders`, { method: "POST", headers: cfHeaders("2023-08-01"), body: JSON.stringify({
      order_id: id, order_amount: p.amount, order_currency: "INR", customer_details: customer,
      order_meta: { return_url: `${origin}/account/?order_id={order_id}` }, order_note: p.name,
    }) });
    const d = await r.json();
    if (!r.ok) return json({ error: d.message ?? "cashfree error" }, 502);
    await admin.from("payments").insert({ id, user_id: user.id, kind: "order", plan_key: plan, amount_paise: p.amount * 100 });
    return json({ payment_session_id: d.payment_session_id, order_id: id });
  }

  const r = await fetch(`${cfBase()}/subscriptions`, { method: "POST", headers: { ...cfHeaders("2025-01-01"), "x-idempotency-key": id }, body: JSON.stringify({
    subscription_id: id,
    customer_details: { customer_name: customer.customer_name, customer_email: customer.customer_email, customer_phone: customer.customer_phone },
    plan_details: { plan_name: p.name, plan_type: "PERIODIC", plan_amount: p.amount, plan_max_amount: p.amount,
      plan_max_cycles: 120, plan_intervals: 1, plan_interval_type: "MONTH", plan_currency: "INR" },
    authorization_details: { authorization_amount: 1, authorization_amount_refund: true, payment_methods: ["upi", "card", "enach"] },
    subscription_meta: { return_url: `${origin}/account/?subscription_id=${id}` },
    subscription_tags: { psp_note: p.name },
  }) });
  const d = await r.json();
  if (!r.ok) return json({ error: d.message ?? "cashfree error" }, 502);
  await admin.from("subscriptions").insert({ id, user_id: user.id, plan_key: plan, plan_name: p.name,
    amount_paise: p.amount * 100, status: d.subscription_status ?? "INITIALIZED", cf_subscription_id: d.cf_subscription_id });
  return json({ subscription_session_id: d.subscription_session_id, subscription_id: id });
});
