import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, getSupabaseUserClient } from '@/lib/db/server';
import { HttpError } from '@/lib/http/errors';
import type { Database } from '@/lib/types/database.generated';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UserContext {
  userId: string;
  supabase: SupabaseClient<Database>;
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

export async function requireUserContext(request: Request): Promise<UserContext> {
  const accessToken = getBearerToken(request);
  if (accessToken) {
    const supabase = getSupabaseUserClient(accessToken);
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new HttpError(401, 'unauthorized');
    }
    return { userId: data.user.id, supabase };
  }

  if (process.env.NODE_ENV !== 'production' && process.env.DEV_USER_ID) {
    const devUserId = process.env.DEV_USER_ID;
    if (!UUID_REGEX.test(devUserId)) {
      throw new HttpError(500, 'invalid_dev_user_id');
    }
    const admin = getSupabaseAdmin();
    const { error: seedErr } = await admin
      .from('users_profile')
      .upsert(
        { id: devUserId, email: `dev+${devUserId}@example.test` },
        { onConflict: 'id' },
      );
    if (seedErr) throw seedErr;
    // Dev bypass: use the admin client so the route's RLS-protected writes
    // succeed without a bearer token. Every route already filters by
    // `.eq('user_id', userId)` defensively, so tenant isolation is preserved.
    return { userId: devUserId, supabase: admin };
  }

  throw new HttpError(401, 'unauthorized');
}
