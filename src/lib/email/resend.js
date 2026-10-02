/** Production provider using the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function resendProvider({ apiKey, fetch, endpoint = 'https://api.resend.com/emails' }) {
  if (!apiKey) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend.');
  return {
    name: 'resend',
    async send({ from, to, subject, html, text }) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
        throw new Error(`Resend responded ${res.status}${detail ? `: ${detail}` : ''}`);
      }
      return res.json();
    },
  };
}
