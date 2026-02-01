import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const event = await prisma.event.findUnique({ where: { id: params.id } });
    if (!event) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    await prisma.access.create({
      data: {
        tenantId: event.tenantId,
        eventId: event.id,
        userId: user.id,
      },
    });

    await prisma.notification.updateMany({
      where: {
        tenantId: event.tenantId,
        type: 'UNACCESSED_EVENT',
        refId: event.id,
        isClosed: false,
      },
      data: { isClosed: true, closedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
