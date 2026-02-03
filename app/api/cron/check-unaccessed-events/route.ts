import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const toJstMidnightUtc = (date: Date, dayOffset = 0) => {
  const jstDate = new Date(date.getTime() + JST_OFFSET_MS);
  const year = jstDate.getUTCFullYear();
  const month = jstDate.getUTCMonth();
  const day = jstDate.getUTCDate() + dayOffset;
  return new Date(Date.UTC(year, month, day, 0, 0, 0) - JST_OFFSET_MS);
};

export async function GET() {
  const prisma = getPrisma();
  const now = new Date();

  const events = await prisma.event.findMany({
    select: { id: true, tenantId: true, agencyId: true, startDate: true },
  });

  let created = 0;
  let due = 0;
  const skipped = {
    notDue: 0,
    started: 0,
    accessed: 0,
    alreadyNotified: 0,
  };

  for (const event of events) {
    const deadline = toJstMidnightUtc(event.startDate, -2);

    if (now < deadline) {
      skipped.notDue += 1;
      continue;
    }

    if (now >= event.startDate) {
      skipped.started += 1;
      continue;
    }

    due += 1;

    const access = await prisma.access.findFirst({
      where: {
        eventId: event.id,
        user: { agencyId: event.agencyId },
      },
    });

    if (access) {
      skipped.accessed += 1;
      continue;
    }

    const existing = await prisma.notification.findFirst({
      where: {
        type: 'UNACCESSED_EVENT',
        refId: event.id,
        targetDate: deadline,
        isClosed: false,
      },
    });

    if (existing) {
      skipped.alreadyNotified += 1;
      continue;
    }

    await prisma.notification.create({
      data: {
        tenantId: event.tenantId,
        type: 'UNACCESSED_EVENT',
        targetDate: deadline,
        refId: event.id,
        isClosed: false,
      },
    });
    created += 1;
  }

  console.log('[check-unaccessed-events] summary', {
    totalEvents: events.length,
    dueEvents: due,
    created,
    skipped,
  });

  return NextResponse.json({
    ok: true,
    totalEvents: events.length,
    dueEvents: due,
    created,
    skipped,
  });
}
