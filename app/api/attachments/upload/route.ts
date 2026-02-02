import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { AttachmentEntityType } from '@prisma/client';
import { Readable } from 'stream';

export const runtime = 'nodejs';

async function resolveTenantIdForEntity(
  prisma: ReturnType<typeof getPrisma>,
  entityType: AttachmentEntityType,
  entityId: string
): Promise<string | null> {
  // ✅ ここは「あなたの Prisma schema に存在する entityType だけ」扱う
  // いま UI から来るのは VENUE なので、最低限 VENUE は必須。
  if (entityType === AttachmentEntityType.VENUE) {
    const venue = await prisma.venue.findUnique({
      where: { id: entityId },
      select: { tenantId: true },
    });
    return venue?.tenantId ?? null;
  }

  if (entityType === AttachmentEntityType.EVENT) {
    const event = await prisma.event.findUnique({
      where: { id: entityId },
      select: { tenantId: true },
    });
    return event?.tenantId ?? null;
  }

  if (entityType === AttachmentEntityType.INTERMEDIARY) {
    const intermediary = await prisma.intermediary.findUnique({
      where: { id: entityId },
      select: { tenantId: true },
    });
    return intermediary?.tenantId ?? null;
  }

  // schema に存在しない種類を無理に扱わない（将来追加時にここへ追記）
  return null;
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const formData = await request.formData();
    const file = formData.get('file');
    const entityTypeRaw = formData.get('entityType');
    const entityIdRaw = formData.get('entityId');

    if (!(file instanceof File) || !entityTypeRaw || !entityIdRaw) {
      return NextResponse.json({ message: 'Invalid upload payload' }, { status: 400 });
    }

    const entityId = String(entityIdRaw ?? '').trim();
    if (!entityId) return NextResponse.json({ message: 'Invalid entityId' }, { status: 400 });

    const entityTypeStr = String(entityTypeRaw ?? '').trim();
    const allowedEntityTypes = new Set(Object.values(AttachmentEntityType));
    if (!allowedEntityTypes.has(entityTypeStr as AttachmentEntityType)) {
      return NextResponse.json({ message: 'Invalid entityType' }, { status: 400 });
    }
    const entityType = entityTypeStr as AttachmentEntityType;

    // ✅ tenantId はログインユーザー基準
    const tenantId =
      user.role === 'SUPER_ADMIN'
        ? (formData.get('tenantId') ?? user.tenantId)
        : user.tenantId;

    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
    }

    // ✅ entity が同 tenant に属しているかチェック（安全側）
    const entityTenantId = await resolveTenantIdForEntity(prisma, entityType, entityId);
    if (!entityTenantId) {
      return NextResponse.json({ message: 'Invalid entity' }, { status: 400 });
    }
    if (entityTenantId !== tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const storageProvider = process.env.FILE_STORAGE_PROVIDER ?? 'blob';

    // --- Google Drive ---
    if (storageProvider === 'gdrive') {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const serviceAccountBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
      if (!folderId || !serviceAccountBase64) {
        return NextResponse.json({ message: 'Google Drive env is missing' }, { status: 500 });
      }

      let credentials: Record<string, string>;
      try {
        credentials = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf-8'));
      } catch (parseError) {
        return errorResponse(parseError);
      }

      const { google } = await (0, eval)('import("googleapis")');
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      const drive = google.drive({ version: 'v3', auth });

      const buffer = Buffer.from(await file.arrayBuffer());
      const stream = Readable.from(buffer);

      const driveResponse = await drive.files.create({
        requestBody: {
          name: file.name,
          parents: [folderId],
        },
        media: {
          mimeType: file.type || 'application/octet-stream',
          body: stream,
        },
        fields: 'id, webViewLink, webContentLink',
      });

      const driveFileId = driveResponse.data.id;
      if (!driveFileId) {
        return NextResponse.json({ message: 'Failed to upload to Google Drive' }, { status: 500 });
      }

      const attachment = await prisma.attachment.create({
        data: {
          tenantId,
          entityType,
          entityId,
          blobUrl: null,
          driveFileId,
          driveWebViewLink: driveResponse.data.webViewLink ?? null,
          filename: file.name,
          contentType: file.type,
          size: file.size,
          uploadedByUserId: user.id,
        },
      });

      return NextResponse.json(attachment, { status: 201 });
    }

    // --- Vercel Blob ---
    if (storageProvider !== 'blob') {
      return NextResponse.json({ message: 'Invalid FILE_STORAGE_PROVIDER' }, { status: 500 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const blob = await put(`attachments/${tenantId}/${entityType}/${entityId}/${safeName}`, file, { access: 'public' });

    const attachment = await prisma.attachment.create({
      data: {
        tenantId,
        entityType,
        entityId,
        blobUrl: blob.url,
        driveFileId: null,
        driveWebViewLink: null,
        filename: file.name,
        contentType: file.type,
        size: file.size,
        uploadedByUserId: user.id,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
