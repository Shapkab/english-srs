import type { SupabaseClient } from '@supabase/supabase-js';

export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;

// Derive a 0-5 mastery level for a learning target from its review history.
// Input is chronological (oldest -> newest) ratings across all cards
// belonging to the target, at most the last 10. Anything beyond 10 is
// ignored.
//
// Why 10? Balances recency (recent performance matters most) with stability
// (a single bad review shouldn't tank mastery). ~2-4 weeks of regular practice.
// Why last 5 for the level calc? SM-2 research suggests recent performance is
// most predictive of retention.
//
// Definition:
//   - If 5+ ratings: count rating >= 3 in the last 5 reviews -> level 0-5.
//   - If fewer: scale floor(successCount / total * 5).
//   - Empty: 0.
export function computeMasteryLevel(reviewRatings: number[]): MasteryLevel {
  const ratings = reviewRatings.slice(-10);
  if (ratings.length === 0) return 0;
  if (ratings.length >= 5) {
    const lastFive = ratings.slice(-5);
    const successes = lastFive.filter((r) => r >= 3).length;
    return clampLevel(successes);
  }
  const successes = ratings.filter((r) => r >= 3).length;
  return clampLevel(Math.floor((successes / Math.max(1, ratings.length)) * 5));
}

function clampLevel(n: number): MasteryLevel {
  if (n <= 0) return 0;
  if (n >= 5) return 5;
  return n as 1 | 2 | 3 | 4;
}

interface ReviewJoinRow {
  rating: number;
  created_at: string;
  cards:
    | { learning_target_id: string | null }
    | { learning_target_id: string | null }[]
    | null;
}

// Fetch the most recent 10 review ratings per learning target in one
// round trip and reduce them to a {ltId: masteryLevel} map. Returns 0
// for any LT with no reviews.
//
// One round trip per route call -- not per target.
export async function masteryLevelsByLearningTarget(
  supabase: SupabaseClient,
  userId: string,
  ltIds: string[],
): Promise<Record<string, MasteryLevel>> {
  if (ltIds.length === 0) return {};

  const { data, error } = await supabase
    .from('reviews')
    .select('rating, created_at, cards!inner(learning_target_id)')
    .in('cards.learning_target_id', ltIds)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10 * ltIds.length);
  if (error) throw error;

  const rows = (data ?? []) as ReviewJoinRow[];

  if (rows.length === 0) {
    // Cheapest defect to catch: a misconfigured join silently returns
    // empty even when reviews exist. Warn (don't throw) so a working
    // route stays up while the join is investigated.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[mastery] join returned empty for ${ltIds.length} targets — relationship may be misconfigured`,
      );
    }
    return Object.fromEntries(ltIds.map((id) => [id, 0 as MasteryLevel]));
  }

  // rows are DESC by created_at. For each LT, collect the first 10 we
  // see (the newest 10), then reverse to oldest-first for the function.
  const byLt: Record<string, number[]> = {};
  for (const row of rows) {
    const cardJoin = Array.isArray(row.cards) ? row.cards[0] ?? null : row.cards;
    const ltId = cardJoin?.learning_target_id;
    if (!ltId) continue;
    if (!byLt[ltId]) byLt[ltId] = [];
    if (byLt[ltId].length < 10) byLt[ltId].push(row.rating);
  }

  const result: Record<string, MasteryLevel> = {};
  for (const ltId of ltIds) {
    const newestFirst = byLt[ltId] ?? [];
    const chronological = newestFirst.slice().reverse();
    result[ltId] = computeMasteryLevel(chronological);
  }
  return result;
}
