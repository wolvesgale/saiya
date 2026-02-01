import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { AttachmentEntityType } from '@prisma/client';
import { google } from 'googleapis';
import { Readable } from 'stream';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { user, response } = await requireSession();
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
    const entityTypeRaw = String(entityType ?? '');
    const allowedEntityTypes = new Set(Object.values(AttachmentEntityType));
    if (!entityIdValue) {
      return NextResponse.json({ message: 'Invalid entityId' }, { status: 400 });
    }
    if (!allowedEntityTypes.has(entityTypeRaw as AttachmentEntityType)) {
      return NextResponse.json({ message: 'Invalid entityType' }, { status: 400 });
    }
    const entityTypeEnum = entityTypeRaw as AttachmentEntityType;

    const tenantId = user.role === 'SUPER_ADMIN' ? formData.get('tenantId') ?? user.tenantId : user.tenantId;
    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
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

    const blob = await put(`attachments/${tenantId}/${file.name}`, file, { access: 'public' });

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
