export type CalendarWeek = {
  start: Date;
  end: Date;
  days: Date[];
};

export type CalendarEventBase = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  agencyId: string;
  agencyName?: string | null;
  venueName?: string | null;
};

export type WeekSegment<T extends CalendarEventBase> = {
  event: T;
  start: Date;
  end: Date;
  startIndex: number;
  endIndex: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfWeek = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const endOfWeek = (date: Date) => addDays(startOfWeek(date), 6);

export const parseIsoDate = (value: string) => new Date(`${value}T00:00:00`);

export const dayDiff = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);

export const getMonthWeeks = (month: Date): CalendarWeek[] => {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const weeks: CalendarWeek[] = [];
  let cursor = calendarStart;

  while (cursor <= calendarEnd) {
    const weekStart = new Date(cursor);
    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const weekEnd = addDays(weekStart, 6);
    weeks.push({ start: weekStart, end: weekEnd, days });
    cursor = addDays(weekStart, 7);
  }

  return weeks;
};

export const buildWeekLanes = <T extends CalendarEventBase>(
  events: T[],
  weekStart: Date,
  weekEnd: Date,
): WeekSegment<T>[][] => {
  const segments = events.flatMap((eventItem) => {
    const eventStart = parseIsoDate(eventItem.startDate);
    const eventEnd = parseIsoDate(eventItem.endDate);
    if (eventEnd < weekStart || eventStart > weekEnd) return [];
    const segmentStart = eventStart > weekStart ? eventStart : weekStart;
    const segmentEnd = eventEnd < weekEnd ? eventEnd : weekEnd;
    return [
      {
        event: eventItem,
        start: segmentStart,
        end: segmentEnd,
        startIndex: dayDiff(weekStart, segmentStart),
        endIndex: dayDiff(weekStart, segmentEnd),
      },
    ];
  });

  segments.sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());

  const lanes: WeekSegment<T>[][] = [];
  const laneEndDates: Date[] = [];

  segments.forEach((segment) => {
    const laneIndex = laneEndDates.findIndex((endDate) => segment.start > endDate);
    if (laneIndex === -1) {
      lanes.push([segment]);
      laneEndDates.push(segment.end);
    } else {
      lanes[laneIndex].push(segment);
      laneEndDates[laneIndex] = segment.end;
    }
  });

  return lanes;
};
