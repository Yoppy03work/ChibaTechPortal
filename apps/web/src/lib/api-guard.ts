import { NextResponse } from 'next/server';
import { isOriginAllowed } from '@chibatech/shared/src/lib/security-headers';

export function validateStateChangingRequest(
  request: Request,
  options: { requireJson?: boolean } = {}
): NextResponse | null {
  const origin = request.headers.get('origin');
  if (origin && !isOriginAllowed(origin)) {
    return new NextResponse(null, { status: 403 });
  }

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    return new NextResponse(null, { status: 403 });
  }

  if (options.requireJson) {
    const contentType = request.headers.get('content-type') ?? '';
    const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    const isJson = mediaType === 'application/json' || mediaType.endsWith('+json');
    if (!isJson) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415 }
      );
    }
  }

  return null;
}
