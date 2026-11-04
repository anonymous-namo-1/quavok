// In-memory PostgREST mock for cashfree-webhook. Run: deno run -A tests/webhook-mock.ts (from supabase/).
const payments = new Map<string, any>(), invoices: any[] = [];
const subs: Record<string, any> = { sub1: { id: "sub1", user_id: "u1", plan_key: "starter", amount_paise: 499900 } };
payments.set("ord1", { id: "ord1", user_id: "u1", amount_paise: 299900, status: "PENDING" });
const real = globalThis.fetch;
const eq = (u: URL, k: string) => u.searchParams.get(k)?.replace(/^(eq|neq)\./, "");
globalThis.fetch = async (input: any, init: any = {}) => {
  const req = input instanceof Request ? input : new Request(input, init);
  const u = new URL(req.url), body = req.method === "GET" ? null : await req.text();
  const one = (req.headers.get("accept") ?? "").includes("object");
  const j = (rows: any[], s = 200) => new Response(JSON.stringify(one ? rows[0] ?? null : rows), { status: one && !rows.length ? 406 : s, headers: { "content-type": "application/json" } });
  if (u.pathname.endsWith("/webhook_events")) return new Response(null, { status: 201 });
  if (u.pathname.endsWith("/rpc/issue_invoice")) { const b = JSON.parse(body!); if (!invoices.find((i) => i.p_payment === b.p_payment)) invoices.push(b); return j([]); }
  if (u.pathname.endsWith("/subscriptions")) { const s = subs[eq(u, "id")!]; return j(s ? [s] : []); }
  if (u.pathname.endsWith("/payments")) {
    const id = eq(u, "id")!;
    if (req.method === "GET") { const p = payments.get(id); return j(p ? [p] : []); }
    if (req.method === "POST") { const b = JSON.parse(body!); payments.set(b.id, { ...payments.get(b.id), ...b }); return j([b], 201); }
    if (req.method === "PATCH") { const p = payments.get(id), neq = u.searchParams.get("status")?.startsWith("neq.") ? eq(u, "status") : null;
      if (!p || (neq && p.status === neq)) return j([]); Object.assign(p, JSON.parse(body!)); return j([p]); }
  }
  return new Response("unmocked " + u, { status: 599 });
};
Deno.env.set("SUPABASE_URL", "http://mock.supabase"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "srk"); Deno.env.set("CASHFREE_SECRET_KEY", "sec");
await import("../functions/cashfree-webhook/index.ts");
await new Promise((r) => setTimeout(r, 300));
async function send(type: string, data: any, event_time = "2026-11-04T13:00:00+05:30") {
  const raw = JSON.stringify({ type, data, event_time }), ts = String(Date.now());
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("sec"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + raw)))));
  return (await real("http://localhost:8000/", { method: "POST", headers: { "x-webhook-timestamp": ts, "x-webhook-signature": sig }, body: raw })).status;
}
let fail = 0; const check = (n: string, ok: boolean) => { console.log(ok ? "PASS" : "FAIL", n); if (!ok) fail++; };
// One-time order: success, then a late FAILED for an earlier attempt must not downgrade it.
check("order success 200", await send("PAYMENT_SUCCESS_WEBHOOK", { order: { order_id: "ord1" } }) === 200);
check("order PAID + 1 invoice", payments.get("ord1").status === "PAID" && invoices.length === 1);
await send("PAYMENT_FAILED_WEBHOOK", { order: { order_id: "ord1" } });
check("late FAILED keeps PAID", payments.get("ord1").status === "PAID");
check("unknown order id 200, no invoice", await send("PAYMENT_SUCCESS_WEBHOOK", { order: { order_id: "nope" } }) === 200 && invoices.length === 1);
// Subscription: AUTH payment, no invoice.
await send("SUBSCRIPTION_PAYMENT_SUCCESS", { subscription_id: "sub1", cf_payment_id: "a1", payment_type: "AUTH", payment_amount: 1.0 });
check("AUTH recorded, no invoice", payments.get("a1")?.status === "PAID" && invoices.length === 1);
// Charge: failed attempt, then success on retry of the same payment, then duplicate delivery.
await send("SUBSCRIPTION_PAYMENT_FAILED", { subscription_id: "sub1", cf_payment_id: "c1", payment_type: "CHARGE", payment_amount: 4999.0 });
check("charge FAILED recorded", payments.get("c1")?.status === "FAILED");
await send("SUBSCRIPTION_PAYMENT_SUCCESS", { subscription_id: "sub1", cf_payment_id: "c1", payment_type: "CHARGE", payment_amount: 4999.0 });
await send("SUBSCRIPTION_PAYMENT_SUCCESS", { subscription_id: "sub1", cf_payment_id: "c1", payment_type: "CHARGE", payment_amount: 4999.0 });
check("charge PAID, exactly 1 invoice for it", payments.get("c1").status === "PAID" && invoices.filter((i) => i.p_payment === "c1").length === 1);
check("invoice uses paid amount 499900", invoices.find((i) => i.p_payment === "c1")?.p_amount === 499900);
await send("SUBSCRIPTION_PAYMENT_FAILED", { subscription_id: "sub1", cf_payment_id: "c1", payment_type: "CHARGE", payment_amount: 4999.0 });
check("late sub FAILED keeps PAID", payments.get("c1").status === "PAID");
await send("SUBSCRIPTION_PAYMENT_CANCELLED", { subscription_id: "sub1", payment_id: "c2", payment_type: "CHARGE", payment_amount: 4999.0 });
check("cancelled charge recorded", payments.get("c2")?.status === "CANCELLED");
// No payment ids at all: retries of the same event map to one row.
await send("SUBSCRIPTION_PAYMENT_SUCCESS", { subscription_id: "sub1", payment_type: "CHARGE", payment_amount: 4999.0 }, "T1");
await send("SUBSCRIPTION_PAYMENT_SUCCESS", { subscription_id: "sub1", payment_type: "CHARGE", payment_amount: 4999.0 }, "T1");
check("id-less retry -> one invoice", invoices.filter((i) => i.p_payment === "sub1_T1").length === 1);
console.log(fail ? `${fail} FAILED` : "ALL PASS"); Deno.exit(fail ? 1 : 0);
