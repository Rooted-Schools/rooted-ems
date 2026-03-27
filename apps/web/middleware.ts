import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as never)
          );
        },
      },
    }
  );

  // Refresh the session on every request to keep it alive
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase.auth as any).getUser();

  const pathname = request.nextUrl.pathname;

  // Public routes — skip auth checks
  const publicRoutes = ["/", "/login", "/staff-login", "/auth/callback", "/auth/verify", "/inquiry"];
  if (publicRoutes.includes(pathname) || pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  // Protected routes: /family/* requires any auth
  if (pathname.startsWith("/family") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Protected routes: /staff/* requires staff auth + campus assignment
  if (pathname.startsWith("/staff")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/staff-login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    // Verify user is staff with at least one campus role assignment
    const { data: profile } = await supabase
      .from("user_profile")
      .select("is_staff")
      .eq("id", user.id)
      .single();

    if (!profile?.is_staff) {
      // Authenticated but not a staff member — redirect to family portal
      const url = request.nextUrl.clone();
      url.pathname = "/family/dashboard";
      return NextResponse.redirect(url);
    }

    // Check user has at least one campus role assignment
    const { count } = await supabase
      .from("user_campus_role")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (!count || count === 0) {
      // Staff user with no campus assignments — show access denied
      const url = request.nextUrl.clone();
      url.pathname = "/staff-login";
      url.searchParams.set("error", "no_campus_access");
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
