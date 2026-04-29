import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { AttachmentEntityType } from '@prisma/client';

export const runtime = 'nodejs';

/**
 * Vercel Blob クライアント直接アップロード用トークンエンドポイント
 *
 * POST リクエストは 2 種類:
 *   1. blob.generate-client-token  — クライアントがトークンを要求 (セッション検証あり)
 *   2. blob.upload-completed       — Vercel がアップロード完了を通知 (セッション不要)
 *
 * これにより Vercel の 4.5 MB ボディ制限を回避できる。
 */
export async function POST(request: Request) {
  const prisma = getPrisma();
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ message: 'BLOB_READ_WRITE_TOKEN is not configured' }, { status: 500 });
    }

    const body = (await request.json()) as HandleUploadBody;

    // セッション検証はトークン生成リクエスト時のみ実施
    let authorizedUserId = '';
    let authorizedUserRole = '';
    let authorizedTenantId: string | null = null;

    if (body.type === 'blob.generate-client-token') {
      const { user, response } = await requireSession(request);
      if (response) return response;
      if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
      if (roleResponse) return roleResponse;
      authorizedUserId = user.id;
      authorizedUserRole = user.role;
      authorizedTenantId = user.tenantId;
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload, _multipart) => {
        const { entityType, entityId } = clientPayload
          ? (JSON.parse(clientPayload) as { entityType: string; entityId: string })
          : { entityType: '', entityId: '' };

        const allowedEntityTypes = new Set(Object.values(AttachmentEntityType));
        if (!entityType || !entityId || !allowedEntityTypes.has(entityType as AttachmentEntityType)) {
          throw new Error('Invalid entityType or entityId');
        }

        let tenantId: string | null = null;
        if (entityType === AttachmentEntityType.VENUE) {
          const venue = await prisma.venue.findUnique({ where: { id: entityId }, select: { tenantId: true } });
          tenantId = venue?.tenantId ?? null;
        } else if (entityType === AttachmentEntityType.EVENT) {
          const event = await prisma.event.findUnique({ where: { id: entityId }, select: { tenantId: true } });
          tenantId = event?.tenantId ?? null;
        }

        if (!tenantId) throw new Error('Entity not found');
        if (authorizedUserRole !== 'SUPER_ADMIN' && tenantId !== authorizedTenantId) {
          throw new Error('Forbidden');
        }

        return {
          tokenPayload: JSON.stringify({ entityType, entityId, tenantId, userId: authorizedUserId }),
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // この関数は Vercel が直接呼び出すため、ユーザーセッションは使用不可。
        // tokenPayload に署名済みデータが含まれる。
        const { entityType, entityId, tenantId, userId } = JSON.parse(tokenPayload ?? '{}') as {
          entityType: string;
          entityId: string;
          tenantId: string;
          userId: string;
        };

        await prisma.attachment.create({
          data: {
            tenantId,
            entityType: entityType as AttachmentEntityType,
            entityId,
            blobUrl: blob.url,
            driveFileId: null,
            driveWebViewLink: null,
            filename: blob.pathname.split('/').pop() ?? blob.pathname,
            contentType: blob.contentType ?? 'application/octet-stream',
            size: 0,
            uploadedByUserId: userId,
          },
        });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return errorResponse(error);
  }
}
