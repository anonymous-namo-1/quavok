/* Indian mobile: accepts 98765 43210, +91 98765 43210, 09876543210 -> "9876543210" or null. */
export function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
export const phoneField = (id, val = '') => `<label for="${id}">Mobile number (India)</label><br><span style="display:inline-flex;align-items:center;gap:6px"><span aria-hidden="true">+91</span><input id="${id}" type="tel" inputmode="numeric" autocomplete="tel-national" required maxlength="14" pattern="[0-9 ]{10,14}" placeholder="10-digit mobile" value="${val}" aria-describedby="${id}-h" style="padding:10px;min-width:200px"></span><br><small id="${id}-h">Used for payment receipts and UPI AutoPay. 10 digits, starting 6–9.</small>`;
export async function savePhone(sb, raw) {
  const p = normPhone(raw); if (!p) throw new Error('Enter a valid 10-digit Indian mobile number.');
  const { error } = await sb.rpc('set_my_phone', { p_phone: p }); if (error) throw error; return p;
}
