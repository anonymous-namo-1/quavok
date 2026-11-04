const C = window.QUAVOK_CONFIG || {}, $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const inr = p => '₹' + (p / 100).toLocaleString('en-IN');
if (!C.supabaseUrl || !C.supabaseAnonKey) { $('acc-off').hidden = false; }
else {
  let sb;
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    sb = createClient(C.supabaseUrl, C.supabaseAnonKey);
  } catch (e) { $('acc-off').hidden = false; throw e; }
  const back = location.origin + '/account/';
  $('ml').onsubmit = async e => { e.preventDefault();
    const { error } = await sb.auth.signInWithOtp({ email: $('em').value, options: { emailRedirectTo: back } });
    $('msg').textContent = error ? 'Could not send the link: ' + error.message : 'Check your email for a sign-in link.'; };
  $('g').onclick = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back } });
  $('out').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  const render = async session => {
    $('acc-in').hidden = !!session; $('acc-dash').hidden = !session;
    if (!session) return;
    $('who').textContent = session.user.email;
    const { data: subs } = await sb.from('subscriptions').select('*').order('created_at', { ascending: false });
    $('plan').innerHTML = subs?.length ? '<table><tr><th>Plan</th><th>Status</th><th>Amount</th><th>Next charge</th></tr>' +
      subs.map(s => `<tr><td>${esc(s.plan_name)}</td><td>${esc(s.status)}</td><td>${inr(s.amount_paise)}/month</td><td>${esc(s.next_charge_date || '–')}</td></tr>`).join('') + '</table>'
      : '<p>No active plan yet. <a href="../pay/">Choose a plan</a>.</p>';
    const { data: inv } = await sb.from('invoices').select('*').order('issued_at', { ascending: false });
    $('inv').innerHTML = inv?.length ? '<table><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th></tr>' +
      inv.map(i => `<tr><td>${i.pdf_url ? `<a href="${esc(i.pdf_url)}">${esc(i.number)}</a>` : esc(i.number)}</td><td>${esc(i.issued_at?.slice(0,10))}</td><td>${inr(i.amount_paise)}</td><td>${esc(i.status)}</td></tr>`).join('') + '</table>'
      : '<p>No invoices yet.</p>';
  };
  const { data } = await sb.auth.getSession(); render(data.session);
  sb.auth.onAuthStateChange((_e, s) => render(s));
}
