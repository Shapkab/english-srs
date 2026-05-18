import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/user';
import { toErrorResponse } from '@/lib/http/errors';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfPrevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

export async function GET(request: Request) {
  try {
    const { userId, supabase } = await requireUserContext(request);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * DAY_MS).toISOString();
    const monthStart = startOfMonth(now).toISOString();
    const prevMonthStart = startOfPrevMonth(now).toISOString();

    const [activeRes, newThisWeekRes, masteredRes, masteredAllRes, reviewsRes] = await Promise.all([
      supabase
        .from('learning_targets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['active', 'mastering']),
      supabase
        .from('learning_targets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['active', 'mastering'])
        .gte('first_seen_at', weekAgo),
      supabase
        .from('learning_targets')
        .select('id, mastered_at', { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'mastered')
        .gte('mastered_at', prevMonthStart),
      supabase
        .from('learning_targets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'mastered'),
      supabase
        .from('reviews')
        .select('rating, created_at')
        .eq('user_id', userId)
        .gte('created_at', sixtyDaysAgo),
    ]);

    if (activeRes.error) throw activeRes.error;
    if (newThisWeekRes.error) throw newThisWeekRes.error;
    if (masteredRes.error) throw masteredRes.error;
    if (masteredAllRes.error) throw masteredAllRes.error;
    if (reviewsRes.error) throw reviewsRes.error;

    const activeTargets = activeRes.count ?? 0;
    const activeTargetsDeltaWeek = newThisWeekRes.count ?? 0;

    const masteredRows = masteredRes.data ?? [];
    let masteredThisMonth = 0;
    let masteredPrev = 0;
    for (const row of masteredRows) {
      const t = row.mastered_at;
      if (!t) continue;
      if (t >= monthStart) masteredThisMonth += 1;
      else if (t >= prevMonthStart) masteredPrev += 1;
    }
    const masteredDeltaPct =
      masteredPrev === 0
        ? masteredThisMonth > 0
          ? 100
          : 0
        : Math.round(((masteredThisMonth - masteredPrev) / masteredPrev) * 100);

    const reviews = reviewsRes.data ?? [];
    const reviews30: { rating: number }[] = [];
    const reviewsPrev30: { rating: number }[] = [];
    for (const r of reviews) {
      if (r.created_at >= thirtyDaysAgo) reviews30.push({ rating: r.rating });
      else reviewsPrev30.push({ rating: r.rating });
    }
    const retention = (rs: { rating: number }[]) => {
      if (rs.length === 0) return 0;
      const ok = rs.filter((r) => r.rating >= 3).length;
      return Math.round((ok / rs.length) * 100);
    };
    const retention30d = retention(reviews30);
    const retentionPrev = retention(reviewsPrev30);
    const retentionDelta = retention30d - retentionPrev;

    return NextResponse.json({
      activeTargets,
      activeTargetsDeltaWeek,
      masteredThisMonth,
      masteredDeltaPct,
      retention30d,
      retentionDelta,
    });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
