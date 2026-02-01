import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
const protectedRoutes = ['/admin', '/agent', '/broker'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!protectedRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('saiya_session')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/agent/:path*', '/broker/:path*'],
};
