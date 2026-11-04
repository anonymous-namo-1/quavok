/* Public config only. The Supabase anon key is public by design (RLS protects data).
   Never put Cashfree keys here: they live in Supabase Edge Function secrets.
   Leave supabaseUrl empty to keep accounts/checkout hidden (site falls back to WhatsApp). */
window.QUAVOK_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  cashfreeMode: "sandbox" /* "sandbox" | "production" */
};
