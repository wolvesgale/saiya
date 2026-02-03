import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
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

    if (attachment.driveFileId) {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const serviceAccountBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
      if (!folderId || !serviceAccountBase64) {
        console.error('[attachments] google drive env missing', {
          hasFolderId: Boolean(folderId),
          hasServiceAccount: Boolean(serviceAccountBase64),
        });
      } else {
        try {
          const credentials = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf-8'));
          const { google } = await import('googleapis');
          const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive'],
          });
          const drive = google.drive({ version: 'v3', auth });
          await drive.files.delete({ fileId: attachment.driveFileId, supportsAllDrives: true });
        } catch (driveError) {
          console.error('[attachments] failed to delete drive file', {
            error: driveError,
            driveFileId: attachment.driveFileId,
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
