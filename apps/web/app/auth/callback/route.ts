import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { NextResponse, type NextRequest } from "next/server";

/** Validate redirect path to prevent open redirect attacks. */
function sanitizeRedirectPath(next: string | null, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  // Only allow paths under /family or /staff
  if (!next.startsWith("/family") && !next.startsWith("/staff")) return fallback;
  return next;
}

/**
 * Handles OAuth callbacks from Google, Apple, and other providers.
 * The `next` query param determines where to redirect after login.
 * - Staff login passes `next=/staff/dashboard`
 * - Family login passes `next=/family/dashboard`
 *
 * Cookies are set directly on the NextResponse object so they are
 * always written — regardless of runtime environment.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeRedirectPath(searchParams.get("next"), "/staff/today");

  // Determine if this is a family login flow (for error redirect)
  const isFamily = next.startsWith("/family");
  const errorRedirect = isFamily ? "/login" : "/staff-login";

  if (!code) {
    return NextResponse.redirect(`${origin}${errorRedirect}?error=no_code`);
  }

  // Build the success redirect response first so we can set cookies on it.
  const successResponse = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read cookies from the incoming request
        getAll() {
          return request.cookies.getAll();
        },
        // Write cookies directly onto the outgoing response — always works
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            successResponse.cookies.set(name, value, options as Parameters<typeof successResponse.cookies.set>[2])
          );
        },
      },
    }
  );

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}${errorRedirect}?error=auth_failed`);
  }

  // For staff routes: verify the authenticated user has is_staff = true.
  // A valid Google account is not the same as a provisioned staff account.
  if (!isFamily && sessionData?.user) {
    const adminClient = createServiceRoleClient();
    const { data: profile } = await adminClient
      .from("user_profile")
      .select("is_staff")
      .eq("id", sessionData.user.id)
      .single();

    if (!profile?.is_staff) {
      // Sign the user back out so they don't remain logged into a staff-less session
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/staff-login?error=not_staff`);
    }
  }

  return successResponse;
}
