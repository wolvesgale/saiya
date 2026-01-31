import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const today = new Date();
  const target = new Date(today);
  target.setDate(target.getDate() + 2);
  const targetDate = new Date(target.toISOString().slice(0, 10));

  const events = await prisma.event.findMany({
    where: { startDate: targetDate },
  });

  let created = 0;

  for (const event of events) {
    const access = await prisma.access.findFirst({ where: { eventId: event.id } });
    if (!access) {
      await prisma.notification.create({
        data: {
          tenantId: event.tenantId,
          type: 'UNACCESSED_EVENT',
          targetDate,
          refId: event.id,
        },
      });
      created += 1;
    }
  }

  return NextResponse.json({ ok: true, created });
}
