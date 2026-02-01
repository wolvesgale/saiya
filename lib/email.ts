export type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export async function sendEmail(payload: EmailPayload) {
  const provider = process.env.EMAIL_PROVIDER ?? 'console';

  if (provider !== 'ses') {
    console.info('[email]', payload);
    return { id: 'console', provider };
  }

  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const from = process.env.SES_FROM;

  if (!region || !accessKeyId || !secretAccessKey || !from) {
    throw new Error('SES env vars missing');
  }

  const client = new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const command = new SendEmailCommand({
    Source: from,
    Destination: { ToAddresses: [payload.to] },
    Message: {
      Subject: { Data: payload.subject },
      Body: { Text: { Data: payload.text } },
    },
  });

  try {
    return await client.send(command);
  } catch (error) {
    console.error('[email] SES send failed', error);
    throw error;
  }
}
