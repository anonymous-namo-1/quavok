// Prices in rupees. Must match /pricing/. Setup fees are invoiced separately as a one-time order.
export const PLANS: Record<string, { name: string; amount: number; recurring: boolean }> = {
  audit: { name: "Quavok Audit", amount: 2999, recurring: false },
  starter: { name: "Quavok Starter", amount: 4999, recurring: true },
  growth: { name: "Quavok Growth", amount: 9999, recurring: true },
  managed: { name: "Quavok Managed Ops", amount: 19999, recurring: true },
  pilot_starter: { name: "Quavok Pilot Starter", amount: 2499, recurring: true },
  pilot_growth: { name: "Quavok Pilot Growth", amount: 4999, recurring: true },
};
export const cfBase = () =>
  Deno.env.get("CASHFREE_ENV") === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
export const cfHeaders = (version: string) => ({
  "content-type": "application/json",
  "x-api-version": version,
  "x-client-id": Deno.env.get("CASHFREE_APP_ID")!,
  "x-client-secret": Deno.env.get("CASHFREE_SECRET_KEY")!,
});
export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_ORIGIN") ?? "https://quavok.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
