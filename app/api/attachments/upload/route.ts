import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { AttachmentEntityType } from '@prisma/client';
import { Readable } from 'stream';

export const runtime = 'nodejs';

function pickAllowedEntityType(entityTypeRaw: string) {
  const allowed = new Set(Object.values(AttachmentEntityType));
  if (!allowed.has(entityTypeRaw as AttachmentEntityType)) return null;
  return entityTypeRaw as AttachmentEntityType;
}

async function inferTenantIdFromEntity(prisma: ReturnType<typeof getPrisma>, entityType: AttachmentEntityType, entityId: string) {
  // NOTE: AttachmentEntityType の定義に合わせて必要なら追加してください。
  // ここではまず VENUE / EVENT / AGENCY / INTERMEDIARY を推定で実装。
  switch (entityType) {
    case 'VENUE': {
      const venue = await prisma.venue.findUnique({ where: { id: entityId }, select: { tenantId: true } });
      return venue?.tenantId ?? null;
    }
    case 'EVENT': {
      const event = await prisma.event.findUnique({ where: { id: entityId }, select: { tenantId: true } });
      return event?.tenantId ?? null;
    }
    case 'AGENCY': {
      const agency = await prisma.agency.findUnique({ where: { id: entityId }, select: { tenantId: true } });
      return agency?.tenantId ?? null;
    }
    case 'INTERMEDIARY': {
      const intermediary = await prisma.intermediary.findUnique({ where: { id: entityId }, select: { tenantId: true } });
      return intermediary?.tenantId ?? null;
    }
    default:
      return null;
  }
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
    const entityType = formData.get('entityType');
    const entityId = formData.get('entityId');

    if (!(file instanceof File) || !entityType || !entityId) {
      return NextResponse.json({ message: 'Invalid upload payload' }, { status: 400 });
    }

    const entityIdValue = String(entityId ?? '').trim();
    if (!entityIdValue) {
      return NextResponse.json({ message: 'Invalid entityId' }, { status: 400 });
    }

    const entityTypeRaw = String(entityType ?? '');
    const entityTypeEnum = pickAllowedEntityType(entityTypeRaw);
    if (!entityTypeEnum) {
      return NextResponse.json({ message: 'Invalid entityType' }, { status: 400 });
    }

    // tenantId: 1) formData or user.tenantId 2) entity 逆引き
    let tenantId: string | null = null;

    if (user.role === 'SUPER_ADMIN') {
      const fromForm = formData.get('tenantId');
      tenantId = (typeof fromForm === 'string' && fromForm.trim()) ? fromForm.trim() : (user.tenantId ?? null);
    } else {
      tenantId = user.tenantId ?? null;
    }

    if (!tenantId) {
      tenantId = await inferTenantIdFromEntity(prisma, entityTypeEnum, entityIdValue);
    }

    if (!tenantId) {
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
    }

    // テナント越境防止（SUPER_ADMIN は許可）
    if (user.role !== 'SUPER_ADMIN' && user.tenantId && tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const storageProvider = process.env.FILE_STORAGE_PROVIDER ?? 'blob';

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

    if (storageProvider !== 'blob') {
      return NextResponse.json({ message: 'Invalid FILE_STORAGE_PROVIDER' }, { status: 500 });
    }

    const safeName = file.name.replace(/[^\w.\-()]+/g, '_');
    const uniqueKey = `attachments/${tenantId}/${entityTypeEnum}/${entityIdValue}/${Date.now()}-${safeName}`;

    // put() / access の仕様は Vercel Blob に準拠 
    const blob = await put(uniqueKey, file, { access: 'public' });

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
