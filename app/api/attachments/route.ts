import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/api';
import { AttachmentEntityType } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const url = new URL(request.url);
    const entityTypeRaw = url.searchParams.get('entityType');
    const entityId = url.searchParams.get('entityId');
    const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;

    if (!entityTypeRaw || !entityId) {
      return NextResponse.json({ message: 'entityType and entityId are required' }, { status: 400 });
    }

    const allowedEntityTypes = new Set(Object.values(AttachmentEntityType));
    if (!allowedEntityTypes.has(entityTypeRaw as AttachmentEntityType)) {
      return NextResponse.json({ message: 'Invalid entityType' }, { status: 400 });
    }
    const entityType = entityTypeRaw as AttachmentEntityType;

    const attachments = await prisma.attachment.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        entityType,
        entityId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      attachments.map((attachment) => ({
        ...attachment,
        url: attachment.driveWebViewLink ?? attachment.blobUrl ?? null,
      })),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
