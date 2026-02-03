import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { AttachmentEntityType } from '@prisma/client';
import { Readable } from 'stream';

export const runtime = 'nodejs';

async function resolveTenantIdForAttachment(params: {
  prisma: ReturnType<typeof getPrisma>;
  entityType: AttachmentEntityType;
  entityId: string;
}) {
  const { prisma, entityType, entityId } = params;

  // Prisma enum (AttachmentEntityType) が VENUE/EVENT しか無い前提
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
      console.error('[attachments] invalid upload payload', {
        hasFile: file instanceof File,
        entityTypeRaw,
        entityIdValue,
      });
      return NextResponse.json({ message: 'Invalid upload payload' }, { status: 400 });
    }

    // enum整合（Prisma enum と一致する値のみ許可）
    const allowedEntityTypes = new Set(Object.values(AttachmentEntityType));
    if (!allowedEntityTypes.has(entityTypeRaw as AttachmentEntityType)) {
      console.error('[attachments] invalid entityType', {
        entityTypeRaw,
        allowed: Array.from(allowedEntityTypes),
      });
      return NextResponse.json({ message: 'Invalid entityType' }, { status: 400 });
    }
    const entityTypeEnum = entityTypeRaw as AttachmentEntityType;

    // tenantId を entity から逆引き（Tenant required を出さない）
    const resolvedTenantId = await resolveTenantIdForAttachment({
      prisma,
      entityType: entityTypeEnum,
      entityId: entityIdValue,
    });

    if (!resolvedTenantId) {
      console.error('[attachments] tenant resolution failed', {
        entityType: entityTypeEnum,
        entityId: entityIdValue,
      });
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
    }

    // ADMIN は自テナントのみ
    if (user.role !== 'SUPER_ADMIN' && resolvedTenantId !== user.tenantId) {
      console.error('[attachments] tenant mismatch', {
        userId: user.id,
        userTenantId: user.tenantId,
        resolvedTenantId,
      });
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const storageProvider = process.env.FILE_STORAGE_PROVIDER ?? 'blob';

    // Google Drive
    if (storageProvider === 'gdrive') {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const serviceAccountBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
      if (!folderId || !serviceAccountBase64) {
        console.error('[attachments] google drive env missing', {
          hasFolderId: Boolean(folderId),
          hasServiceAccount: Boolean(serviceAccountBase64),
        });
        return NextResponse.json({ message: 'Google Drive env is missing' }, { status: 500 });
      }

      let credentials: Record<string, string>;
      try {
        credentials = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf-8'));
      } catch (parseError) {
        console.error('[attachments] failed to parse google service account JSON', parseError);
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
        console.error('[attachments] drive upload missing file id', {
          fileName: file.name,
          entityType: entityTypeEnum,
          entityId: entityIdValue,
        });
        return NextResponse.json({ message: 'Failed to upload to Google Drive' }, { status: 500 });
      }

      const attachment = await prisma.attachment.create({
        data: {
          tenantId: resolvedTenantId,
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

      return NextResponse.json(
        {
          ...attachment,
          url: attachment.driveWebViewLink,
        },
        { status: 201 },
      );
    }

    // Vercel Blob
    if (storageProvider !== 'blob') {
      console.error('[attachments] invalid storage provider', { storageProvider });
      return NextResponse.json({ message: 'Invalid FILE_STORAGE_PROVIDER' }, { status: 500 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('[attachments] missing BLOB_READ_WRITE_TOKEN', {
        storageProvider,
      });
      return NextResponse.json({ message: 'BLOB_READ_WRITE_TOKEN is missing' }, { status: 500 });
    }

    // put は Blob SDK。access: 'public' を明示。:contentReference[oaicite:0]{index=0}
    const blob = await put(`attachments/${resolvedTenantId}/${file.name}`, file, { access: 'public' }); // :contentReference[oaicite:1]{index=1}

    const attachment = await prisma.attachment.create({
      data: {
        tenantId: resolvedTenantId,
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

    return NextResponse.json(
      {
        ...attachment,
        url: attachment.blobUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[attachments] upload failed', {
      error,
      hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      storageProvider: process.env.FILE_STORAGE_PROVIDER ?? 'blob',
    });
    return errorResponse(error);
  }
}
