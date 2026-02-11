import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

type VenuePayload = {
  name?: string;
  address?: string | null;
  note?: string | null;
  attachmentUrl?: string | null;
  phone?: string | null;
  contactName?: string | null;
  trashRule?: string | null;
  cashHandling?: 'HOLD' | 'TAKE_HOME' | null;
  notes?: string | null;
  hours?: string | null;
  workWindow?: string | null;
  loadInTime?: string | null;
  loadOutTime?: string | null;
  preContactRequired?: boolean;
  brokerNote?: string | null;
  agencyId?: string | null;
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const payload = (await request.json()) as VenuePayload;
    const venue = await prisma.venue.findUnique({ where: { id: params.id } });
    if (!venue) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && venue.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const agencyId = payload.agencyId === '' ? null : payload.agencyId;
    if (agencyId) {
      const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
      if (!agency || agency.tenantId !== venue.tenantId) {
        return NextResponse.json({ message: 'Invalid agencyId' }, { status: 400 });
      }
    }

    const updated = await prisma.venue.update({
      where: { id: params.id },
      data: {
        name: payload.name ?? venue.name,
        address: payload.address ?? venue.address,
        note: payload.note ?? venue.note,
        attachmentUrl: payload.attachmentUrl ?? venue.attachmentUrl,
        phone: payload.phone ?? venue.phone,
        contactName: payload.contactName ?? venue.contactName,
        trashRule: payload.trashRule ?? venue.trashRule,
        cashHandling: payload.cashHandling ?? venue.cashHandling,
        notes: payload.notes ?? venue.notes,
        hours: payload.hours ?? venue.hours,
        workWindow: payload.workWindow ?? venue.workWindow,
        loadInTime: payload.loadInTime ?? venue.loadInTime,
        loadOutTime: payload.loadOutTime ?? venue.loadOutTime,
        preContactRequired: payload.preContactRequired ?? venue.preContactRequired,
        brokerNote: payload.brokerNote ?? venue.brokerNote,
        agencyId: agencyId ?? null,
      },
    });

    auditLog('venue.updated', { venueId: updated.id, userId: user.id });

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const venue = await prisma.venue.findUnique({ where: { id: params.id } });
    if (!venue) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && venue.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    try {
      await prisma.venue.delete({ where: { id: params.id } });
    } catch (deleteError) {
      if (deleteError instanceof Prisma.PrismaClientKnownRequestError && deleteError.code === 'P2003') {
        return NextResponse.json({ message: '関連するイベントがあるため削除できません。' }, { status: 409 });
      }
      throw deleteError;
    }

    auditLog('venue.deleted', { venueId: params.id, userId: user.id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
