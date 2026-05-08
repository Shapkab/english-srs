import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUserClient } from '@/lib/db/server';
import { HttpError } from '@/lib/http/errors';
import type { Database } from '@/lib/types/database.generated';

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
    return {
      userId: process.env.DEV_USER_ID,
      supabase: getSupabaseUserClient(),
    };
  }

  throw new HttpError(401, 'unauthorized');
}
