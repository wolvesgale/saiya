import { getPrisma } from '@/lib/db';

export type SalesExportRecord = {
  date: string;
  amount: number;
  venueName: string;
  agencyName: string;
  eventId: string;
  saleId: string;
  createdAt: string;
  tenantId: string;
};

type SalesExportParams = {
  from: Date;
  to: Date;
  tenantId?: string;
  agencyId?: string;
};

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function fetchSalesExport(params: SalesExportParams): Promise<SalesExportRecord[]> {
  const prisma = getPrisma();
  const sales = await prisma.sale.findMany({
    where: {
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      ...(params.agencyId ? { agencyId: params.agencyId } : {}),
      date: {
        gte: params.from,
        lte: params.to,
      },
    },
    include: {
      event: { include: { venue: true } },
      agency: true,
    },
    orderBy: { date: 'asc' },
  });

  return sales.map((sale) => ({
    date: formatDateOnly(sale.date),
    amount: sale.amount,
    venueName: sale.event?.venue?.name ?? '',
    agencyName: sale.agency?.name ?? '',
    eventId: sale.eventId,
    saleId: sale.id,
    createdAt: sale.createdAt.toISOString(),
    tenantId: sale.tenantId,
  }));
}
