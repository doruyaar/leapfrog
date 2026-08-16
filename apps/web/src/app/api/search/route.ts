import { NextResponse } from 'next/server';
import { searchAll } from '@/lib/search';

export const dynamic = 'force-dynamic';

/**
 * Global entity search for the top-bar palette. Reads-only, deterministic, and safe
 * with no data loaded: an empty or dataless query returns empty groups, never an error.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return NextResponse.json(searchAll(query));
}
