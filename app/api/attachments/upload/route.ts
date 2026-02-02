// app/api/attachments/upload/route.ts
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { AttachmentEntityType } from '@prisma/client';
import { Readable } from 'stream';

export const runtime = 'nodejs';

async function assertEntityBelongsToTenant(params: {
  prisma: ReturnType<typeof getPrisma>;
  entityType: AttachmentEntityType;
  entityId: string;
  tenantId: string;
}) {
  const { prisma, entityType, entityId, tenantId } = params;

  if (entityType === AttachmentEntityType.VENUE) {
    const venue = await prisma.venue.findUnique({
      where: { id: entityId },
      select: { tenantId: true },
    });
    if (!venue) return { ok: false as const, message: 'Venue not found' };
    if (venue.tenantId !== tenantId) return { ok: false as const, message: 'Invalid tenant for venue' };
    return { ok: true as const };
  }

  if (entityType === AttachmentEntityType.EVENT) {
    const event = await prisma.event.findUnique({
      where: { id: entityId },
      select: { tenantId: true },
    });
    if (!event) return { ok: false as const, message: 'Event not found' };
    if (event.tenantId !== tenantId) return { ok: false as const, message: 'Invalid tenant for event' };
    return { ok: true as const };
  }

  // schema.prisma 上ここには来ない想定（将来enum拡張したらここも更新）
  return { ok: false as const, message: 'Unsupported entityType' };
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
    const entityTypeRaw = String(entityType ?? '').trim();

    if (!entityIdValue) {
      return NextResponse.json({ message: 'Invalid entityId' }, { status: 400 });
    }

    // AttachmentEntityType は schema.prisma の enum から生成されるため
    // "VENUE" | "EVENT" 以外をここで弾く
    const allowed = new Set(Object.values(AttachmentEntityType));
    if (!allowed.has(entityTypeRaw as AttachmentEntityType)) {
      return NextResponse.json({ message: 'Invalid entityType' }, { status: 400 });
    }
    const entityTypeEnum = entityTypeRaw as AttachmentEntityType;

    const tenantId = user.role === 'SUPER_ADMIN' ? (formData.get('tenantId') ?? user.tenantId) : user.tenantId;
    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ message: 'Tenant required' }, { status: 400 });
    }

    // 添付先が同一 tenant か検証（誤リンク/越境を防ぐ）
    const ownership = await assertEntityBelongsToTenant({
      prisma,
      entityType: entityTypeEnum,
      entityId: entityIdValue,
      tenantId,
    });
    if (!ownership.ok) {
      return NextResponse.json({ message: ownership.message }, { status: 400 });
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

    // --- Vercel Blob ---
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
