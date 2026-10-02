// Email templates in English and Arabic. Each returns { subject, text, html }.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, lang) => n === 0 ? (lang === 'ar' ? 'مجاني' : 'Free') : `${Number(n).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')} ${lang === 'ar' ? 'ج.م' : 'EGP'}`;

function layout({ lang, title, body, button }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const font = lang === 'ar' ? "'Readex Pro',Tahoma,sans-serif" : "Figtree,Helvetica,Arial,sans-serif";
  return `<!doctype html><html lang="${lang}" dir="${dir}"><body style="margin:0;background:#F2F5F7;font-family:${font};color:#0D2130">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #D6DFE6" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:800;color:#0E5E6F">${lang === 'ar' ? 'منهل' : 'Manhal'}</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6;text-align:${lang === 'ar' ? 'right' : 'left'}">
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${body}
${button ? `<p style="margin:24px 0 8px"><a href="${esc(button.url)}" style="display:inline-block;background:#E9A21A;color:#231700;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none">${esc(button.label)}</a></p>
<p style="font-size:12px;color:#566977;word-break:break-all">${esc(button.url)}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

const T = {
  verify: {
    en: d => ({
      subject: 'Confirm your email for Manhal',
      title: `Welcome, ${d.name}`,
      lines: ['Confirm your email address to finish setting up your account. This link expires in 24 hours.'],
      button: { label: 'Confirm email', url: d.url },
      footer: "If you didn't create a Manhal account, you can ignore this email.",
    }),
    ar: d => ({
      subject: 'أكّد بريدك الإلكتروني في منهل',
      title: `أهلًا ${d.name}`,
      lines: ['أكّد بريدك الإلكتروني لإكمال إعداد حسابك. ينتهي هذا الرابط خلال 24 ساعة.'],
      button: { label: 'تأكيد البريد', url: d.url },
      footer: 'إذا لم تنشئ حسابًا في منهل، تجاهل هذه الرسالة.',
    }),
  },
  reset: {
    en: d => ({
      subject: 'Reset your Manhal password',
      title: 'Reset your password',
      lines: ['Someone asked to reset the password for this account. The link works once and expires in 1 hour.'],
      button: { label: 'Choose a new password', url: d.url },
      footer: "If this wasn't you, ignore this email. Your password won't change.",
    }),
    ar: d => ({
      subject: 'إعادة تعيين كلمة المرور في منهل',
      title: 'إعادة تعيين كلمة المرور',
      lines: ['طلب أحدهم إعادة تعيين كلمة مرور هذا الحساب. الرابط يعمل مرة واحدة وينتهي خلال ساعة.'],
      button: { label: 'اختر كلمة مرور جديدة', url: d.url },
      footer: 'إذا لم تطلب ذلك، تجاهل الرسالة ولن تتغير كلمة مرورك.',
    }),
  },
  receipt: {
    en: d => ({
      subject: `Your Manhal receipt #${d.order.id}`,
      title: 'Thanks for your purchase',
      lines: [`Order #${d.order.id} · ${d.date}`],
      items: true,
      button: { label: 'Start learning', url: d.url },
      footer: 'Questions about this order? Reply to this email.',
    }),
    ar: d => ({
      subject: `إيصال منهل رقم ${d.order.id}`,
      title: 'شكرًا لشرائك',
      lines: [`الطلب رقم ${d.order.id} · ${d.date}`],
      items: true,
      button: { label: 'ابدأ التعلّم', url: d.url },
      footer: 'لديك سؤال عن هذا الطلب؟ رد على هذه الرسالة.',
    }),
  },
  refund: {
    en: d => ({
      subject: `Refund for Manhal order #${d.order.id}`,
      title: 'Your refund is on its way',
      lines: [`We refunded ${money(d.order.total, 'en')} for order #${d.order.id}. Banks usually take 5 to 14 days to show it.`],
      footer: 'Access to the refunded courses has ended.',
    }),
    ar: d => ({
      subject: `استرداد الطلب رقم ${d.order.id} في منهل`,
      title: 'تم رد المبلغ',
      lines: [`رددنا ${money(d.order.total, 'ar')} للطلب رقم ${d.order.id}. يظهر المبلغ عادة خلال 5 إلى 14 يومًا.`],
      footer: 'انتهى وصولك إلى الدورات المستردة.',
    }),
  },
};

export const templateNames = Object.keys(T);

export function render(template, lang, data) {
  const set = T[template];
  if (!set) throw new Error(`Unknown email template: ${template}`);
  const l = lang === 'ar' ? 'ar' : 'en';
  const m = set[l](data);
  let rows = '', textRows = '';
  if (m.items) {
    const o = data.order;
    rows = `<table role="presentation" width="100%" style="border-collapse:collapse;margin-top:12px">${data.items.map(i =>
      `<tr><td style="padding:8px 0;border-bottom:1px solid #D6DFE6">${esc(i.title)}</td><td style="padding:8px 0;border-bottom:1px solid #D6DFE6;text-align:${l === 'ar' ? 'left' : 'right'}">${money(i.price, l)}</td></tr>`).join('')}
${o.discount ? `<tr><td style="padding:8px 0">${l === 'ar' ? 'الخصم' : 'Discount'}${o.coupon_code ? ` (${esc(o.coupon_code)})` : ''}</td><td style="text-align:${l === 'ar' ? 'left' : 'right'}">-${money(o.discount, l)}</td></tr>` : ''}
<tr><td style="padding:8px 0;font-weight:800">${l === 'ar' ? 'الإجمالي' : 'Total'}</td><td style="font-weight:800;text-align:${l === 'ar' ? 'left' : 'right'}">${money(o.total, l)}</td></tr></table>`;
    textRows = data.items.map(i => `- ${i.title}: ${money(i.price, l)}`).join('\n') +
      (o.discount ? `\n${l === 'ar' ? 'الخصم' : 'Discount'}: -${money(o.discount, l)}` : '') +
      `\n${l === 'ar' ? 'الإجمالي' : 'Total'}: ${money(o.total, l)}`;
  }
  const body = m.lines.map(x => `<p style="margin:0 0 10px">${esc(x)}</p>`).join('') + rows +
    (m.footer ? `<p style="margin-top:18px;font-size:13px;color:#566977">${esc(m.footer)}</p>` : '');
  const html = layout({ lang: l, title: m.title, body, button: m.button });
  const text = [m.title, '', ...m.lines, textRows, m.button ? `\n${m.button.label}: ${m.button.url}` : '', m.footer ? `\n${m.footer}` : '']
    .filter(x => x !== '').join('\n');
  return { subject: m.subject, html, text };
}
