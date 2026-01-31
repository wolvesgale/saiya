export type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail(payload: EmailPayload) {
  const provider = process.env.EMAIL_PROVIDER ?? 'console';

  if (provider === 'console') {
    console.info('[email]', payload);
    return { id: 'console', provider };
  }

  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    if (!apiKey || !from) throw new Error('Resend env vars missing');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: payload.to, subject: payload.subject, text: payload.text }),
    });
    if (!response.ok) {
      throw new Error('Failed to send email via Resend');
    }
    return response.json();
  }

  if (provider === 'ses') {
    console.info('[email] SES provider selected. Implement AWS SES integration.');
    return { id: 'ses-placeholder', provider };
  }

  throw new Error(`Unknown email provider: ${provider}`);
}
