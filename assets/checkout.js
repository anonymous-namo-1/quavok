/* Online checkout via Supabase Edge Function + Cashfree. Hidden unless configured. */
const C = window.QUAVOK_CONFIG || {}, box = document.getElementById('checkout');
if (box && C.supabaseUrl && C.supabaseAnonKey) {
  const PLANS = { audit: 'Audit (one-time), ₹2,999', starter: 'Starter, ₹4,999/month + ₹9,999 setup',
    growth: 'Growth, ₹9,999/month + ₹14,999 setup', managed: 'Managed Ops, ₹19,999/month + ₹24,999 setup',
    pilot_starter: 'Pilot: Starter, ₹2,499/month', pilot_growth: 'Pilot: Growth, ₹4,999/month' };
  box.hidden = false; document.getElementById('paynone').hidden = true;
  box.innerHTML = '<h2>Pay online</h2><p>Sign in first so your plan and invoices show in <a href="../account/">your account</a>. Monthly plans use UPI AutoPay or card mandate; setup fees are invoiced separately. Cancel as per our <a href="../terms/">terms</a>.</p>' +
    Object.entries(PLANS).map(([k, v]) => `<p><button class="btn btn-p" type="button" data-plan="${k}">${v}</button></p>`).join('') + '<p id="cmsg" role="status" aria-live="polite"></p>';
  const msg = t => document.getElementById('cmsg').textContent = t;
  box.addEventListener('click', async e => {
    const plan = e.target.dataset?.plan; if (!plan) return;
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(C.supabaseUrl, C.supabaseAnonKey);
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { location.href = '../account/?next=pay'; return; }
      msg('Starting secure checkout…');
      const { data, error } = await sb.functions.invoke('cashfree-checkout', { body: { plan } });
      if (error || !data) throw error || new Error('No response');
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://sdk.cashfree.com/js/v3/cashfree.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
      const cf = window.Cashfree({ mode: C.cashfreeMode === 'production' ? 'production' : 'sandbox' });
      if (data.subscription_session_id) await cf.subscriptionsCheckout({ subsSessionId: data.subscription_session_id, redirectTarget: '_self' });
      else await cf.checkout({ paymentSessionId: data.payment_session_id, redirectTarget: '_self' });
    } catch (err) { msg('Online checkout is unavailable right now. Please message us on WhatsApp and we will send a payment link.'); console.error(err); }
  });
}
