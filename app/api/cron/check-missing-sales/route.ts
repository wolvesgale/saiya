import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';

export async function GET() {
  const today = new Date();
  const targetDate = new Date(today.toISOString().slice(0, 10));

  const eventDays = await prisma.eventDay.findMany({
    where: { date: targetDate },
    include: { event: true },
  });

  const notifications = [];

  for (const eventDay of eventDays) {
    const sales = await prisma.sale.findMany({
      where: {
        eventId: eventDay.eventId,
        date: targetDate,
        partyType: 'AGENT',
      },
    });

    if (sales.length === 0) {
      const notification = await prisma.notification.create({
        data: {
          tenantId: eventDay.tenantId,
          type: 'MISSING_SALES',
          targetDate,
          refId: eventDay.eventId,
        },
      });
      notifications.push(notification);
    }
  }

  if (notifications.length > 0) {
    const superAdmins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true } });
    await Promise.all(
      superAdmins.map((admin) =>
        sendEmail({
          to: admin.email,
          subject: '未入力の売上が検知されました',
          text: `未入力の売上が${notifications.length}件あります。管理画面で確認してください。`,
        })
      )
    );
  }

  return NextResponse.json({ ok: true, created: notifications.length });
}
