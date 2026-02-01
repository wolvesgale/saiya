import type { Prisma } from '@prisma/client';
import type { SessionUser } from '@/lib/auth';

export function tenantFilter(user: SessionUser): Prisma.TenantWhereInput | Prisma.UserWhereInput {
  if (user.role === 'SUPER_ADMIN') {
    return {};
  }
  return { tenantId: user.tenantId ?? undefined };
}

export function requireTenantId(user: SessionUser) {
  if (!user.tenantId && user.role !== 'SUPER_ADMIN') {
    const error = new Error('Tenant required');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  return user.tenantId;
}
