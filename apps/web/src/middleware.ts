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
 */
export function middleware(request: NextRequest): NextResponse {
  const user = process.env.DEMO_USER;
  const pass = process.env.DEMO_PASS;

  // No credentials configured → gate is off (local dev and demo mode).
  if (!user || !pass) return NextResponse.next();

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
