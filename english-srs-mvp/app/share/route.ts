import { type NextRequest, NextResponse } from 'next/server';

// Web Share Target endpoint. Android shares POST multipart/form-data here;
// we fold the shared fields into one text blob and redirect to /submit
// with it pre-filled. GET is a query-param fallback.

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const title = (formData.get('title') as string) || '';
    const text = (formData.get('text') as string) || '';
    const url = (formData.get('url') as string) || '';

    const combined = [title, text, url].filter(Boolean).join('\n\n');
    const target = new URL('/submit', request.url);
    if (combined) target.searchParams.set('text', combined);
    return NextResponse.redirect(target);
  } catch {
    return NextResponse.redirect(new URL('/submit', request.url));
  }
}

export async function GET(request: NextRequest) {
  const text = new URL(request.url).searchParams.get('text') ?? '';
  const target = new URL('/submit', request.url);
  if (text) target.searchParams.set('text', text);
  return NextResponse.redirect(target);
}
