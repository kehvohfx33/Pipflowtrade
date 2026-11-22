export interface EmailDispatchResult {
  sent: boolean;
  provider: 'brevo' | 'unconfigured';
  message: string;
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailDispatchResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || 'noreply@pipflowtrade.site';
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'PIPFLOWTRADE.SITE';

  if (!apiKey) {
    return {
      sent: false,
      provider: 'unconfigured',
      message: 'BREVO_API_KEY is not configured; email delivery skipped.',
    };
  }

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[email] Brevo API failure:', resp.status, errText);
      return { sent: false, provider: 'brevo', message: `Email provider returned ${resp.status}` };
    }

    return { sent: true, provider: 'brevo', message: 'Email sent' };
  } catch (err: any) {
    console.error('[email] Dispatch error:', err?.message);
    return { sent: false, provider: 'brevo', message: 'Email dispatch failed' };
  }
}
