import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optional HTTP Basic Auth gate for shared deployments (e.g. a password-protected
 * demo link for a reviewer). It is a deployment concern, not a product feature:
 *
 *   - Set `DEMO_USER` and `DEMO_PASS` to require credentials on every request.
 *   - Leave either unset (the default, including local `npm run dev`) to disable the
 *     gate entirely, so demo mode stays zero-config.
 *
 * This is deliberately not a real auth system — DESIGN.md §6 keeps SSO/RBAC as a
 * next step. It only stops a public URL from being world-open during a demo.
 *
 * Fail-closed in production: leaving the credentials unset is expected for local dev
 * and demo mode, but on a hosted build a missing credential is almost always a
 * forgotten dashboard secret — not an intent to serve the app (and, with
 * `INGEST_LIVE=1`, a metered `/api/ask`) to the whole internet. So a production build
 * with the gate unset refuses to serve unless the operator has *explicitly* opted into
 * a public deployment with `LEAPFROG_ALLOW_PUBLIC=1`.
 */
export function middleware(request: NextRequest): NextResponse {
  const user = process.env.DEMO_USER;
  const pass = process.env.DEMO_PASS;

  // No credentials configured.
  if (!user || !pass) {
    const isProduction = process.env.NODE_ENV === 'production';
    const publicOptIn = process.env.LEAPFROG_ALLOW_PUBLIC === '1';
    if (isProduction && !publicOptIn) {
      return new NextResponse(
        'This deployment is misconfigured: set DEMO_USER and DEMO_PASS to enable the ' +
          'access gate, or set LEAPFROG_ALLOW_PUBLIC=1 to intentionally run without one.',
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }
    // Local dev, demo mode, or an explicit public deployment → gate is off.
    return NextResponse.next();
  }

  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    // Malformed base64 must fall through to the 401 below, not throw a 500.
    let decoded = '';
    try {
      decoded = atob(header.slice('Basic '.length));
    } catch {
      decoded = '';
    }
    const separator = decoded.indexOf(':');
    const suppliedUser = decoded.slice(0, separator);
    const suppliedPass = decoded.slice(separator + 1);
    if (separator !== -1 && suppliedUser === user && suppliedPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="LeapFrog", charset="UTF-8"' },
  });
}

/**
 * Guard every path except the health probe (load balancers must reach it without
 * credentials) and Next's own static assets.
 */
export const config = {
  matcher: ['/((?!api/health|_next/static|_next/image|favicon.ico).*)'],
};
