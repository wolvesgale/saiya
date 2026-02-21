import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

function formatTimestamp(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 管理者によるメモ全体の上書き編集
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const event = await prisma.event.findUnique({ where: { id: params.id } });
    if (!event) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json();
    const memoText = (payload.text ?? payload.memo ?? '').toString();

    const updated = await prisma.event.update({
      where: { id: event.id },
      data: { memo: memoText || null },
    });

    return NextResponse.json({ memo: updated.memo });
  } catch (error) {
    return errorResponse(error);
  }
}

// 代理店によるメモ追記（代理店名＋タイムスタンプ自動付与）
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['AGENT']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const memoText = (payload.text ?? payload.memo ?? '').toString().trim();
    if (!memoText) {
      return NextResponse.json({ message: 'Memo is required' }, { status: 400 });
    }

    const event = await prisma.event.findUnique({ where: { id: params.id } });
    if (!event) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    if (user.agencyId && event.agencyId !== user.agencyId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    if (!user.agencyId) {
      return NextResponse.json({ message: 'Agency required' }, { status: 403 });
    }

    const agency = await prisma.agency.findUnique({ where: { id: user.agencyId } });
    if (!agency || agency.tenantId !== event.tenantId) {
      return NextResponse.json({ message: 'Invalid agency' }, { status: 403 });
    }

    const timestamp = formatTimestamp(new Date());
    const line = `${memoText} (${agency.name} ${timestamp})`;
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        memo: event.memo ? `${event.memo}\n${line}` : line,
      },
    });

    return NextResponse.json({ memo: updated.memo });
  } catch (error) {
    return errorResponse(error);
  }
}
