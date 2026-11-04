# Quavok backend (Supabase free tier)
No secrets live in this repo.
1. Create a Supabase project (region ap-south-1 Mumbai). Run `migrations/0001_init.sql` in the SQL editor.
2. Auth → URL config: Site URL `https://quavok.com`, redirect `https://quavok.com/account/`. Enable Email (magic link) and Google (needs a Google Cloud OAuth client; redirect URI `https://<ref>.supabase.co/auth/v1/callback`).
3. Put the project URL + anon key in `/assets/config.js` (public by design; RLS protects data).
4. Secrets: `supabase secrets set CASHFREE_APP_ID=... CASHFREE_SECRET_KEY=... CASHFREE_ENV=sandbox SITE_ORIGIN=https://quavok.com`
5. Deploy: `supabase functions deploy cashfree-checkout` and `supabase functions deploy cashfree-webhook --no-verify-jwt`.
6. Cashfree dashboard → Developers → Webhooks (Payments and Subscriptions): `https://<ref>.supabase.co/functions/v1/cashfree-webhook`. Whitelist domain quavok.com.
7. Test in sandbox, then switch `CASHFREE_ENV=production`, live keys, and `cashfreeMode: "production"` in config.js.
