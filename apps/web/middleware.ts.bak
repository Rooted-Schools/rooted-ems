import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Public routes — no auth needed
  const publicPrefixes = ["/api/", "/auth/", "/_next/", "/favicon"];
  const publicExact = ["/", "/login", "/staff-login", "/inquiry"];

  if (
    publicExact.includes(pathname) ||
    publicPrefixes.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // Check for any Supabase session cookie
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  // Family routes require login
  if (pathname.startsWith("/family") && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Staff routes require login
  // Actual role/campus checks happen in the Server Components, not here
  if (pathname.startsWith("/staff") && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/staff-login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
