import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const attachment = await prisma.attachment.findUnique({ where: { id: params.id } });
    if (!attachment) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && attachment.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    await prisma.attachment.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });

    auditLog('attachment.deleted', { attachmentId: params.id, userId: user.id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
