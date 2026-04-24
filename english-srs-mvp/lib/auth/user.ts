import { headers } from 'next/headers';

export async function requireUserId(): Promise<string> {
  const h = await headers();
  const userId = h.get('x-user-id');
  if (!userId) {
    throw new Error('Missing x-user-id header. Replace this with real auth in production.');
  }
  return userId;
}
