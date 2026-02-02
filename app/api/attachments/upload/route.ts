import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { AttachmentEntityType } from '@prisma/client';
import { Readable } from 'stream';

export const runtime = 'nodejs';

async function resolveTenantIdFromEntity(params: {
  prisma: ReturnType<typeof getPrisma>;
  entityType: AttachmentEntityType;
  entityId: string;
}): Promise<string | null> {
  const { prisma, entityType, entityId } = params;

  if (entityType === AttachmentEntityType.VENUE) {
    const venue = await prisma.venue.findUnique({ where: { id: entityId }, select: { tenantId: true } });
    return venue?.tenantId ?? null;
  }

  if (entityType === AttachmentEntityType.EVENT) {
    const event = await prisma.event.findUnique({ where: { id: entityId }, select: { tenantId: true } });
    return event?.tenantId ?? null;
  }

  // Prisma enum が増えた場合に備えた保険（現状ここには来ない）
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
    const entityTypeRaw = String(formData.get('entityType') ?? '');
    const entityIdValue = String(formData.get('entityId') ?? '').trim();

    if (!(file instanceof File) || !entityTypeRaw || !entityIdValue) {
      return NextResponse.json({ message: 'Invalid upload payload' }, { status: 400 });
    }

    // Prisma enum(=AttachmentEntityType) と一致するものだけ許可
    const allowedEntityTypes = new Set(Object.values(AttachmentEntityType));
    if (!allowedEntityTypes.has(entityTypeRaw as AttachmentEntityType)) {
      return NextResponse.json({ message: 'Invalid entityType' }, { status: 400 });
    }
    const entityTypeEnum = entityTypeRaw as AttachmentEntityType;

    // tenantId の決定（SUPER_ADMIN で user.tenantId が空でも動くようにする）
    let tenantId: string | null =
      user.role === 'SUPER_ADMIN'
        ? (typeof formData.get('tenantId') === 'string' ? String(formData.get('tenantId')) : null) ?? (user.tenantId ?? null)
        : (user.tenantId ?? null);

    if (!tenantId) {
      tenantId = await resolveTenantIdFromEntity({ prisma, entityType: entityTypeEnum, entityId: entityIdValue });
    }

    if (!tenantId) {
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
    }

    const storageProvider = process.env.FILE_STORAGE_PROVIDER ?? 'blob';

    // ---- Google Drive（任意） ----
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
          entityType: entityTypeEnum,
          entityId: entityIdValue,
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

    // ---- Vercel Blob（デフォルト） ----
    if (storageProvider !== 'blob') {
      return NextResponse.json({ message: 'Invalid FILE_STORAGE_PROVIDER' }, { status: 500 });
    }

    const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
    const pathname = `attachments/${tenantId}/${entityTypeEnum}/${entityIdValue}/${Date.now()}-${safeName}`;

    const blob = await put(pathname, file, {
      access: 'public',
      // addRandomSuffix は必要なら true に。まずはパスで一意化しているので false でもOK。
      addRandomSuffix: false,
    });

    const attachment = await prisma.attachment.create({
      data: {
        tenantId,
        entityType: entityTypeEnum,
        entityId: entityIdValue,
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
