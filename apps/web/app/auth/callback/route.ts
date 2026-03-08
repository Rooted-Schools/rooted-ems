export const runtime = "edge";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Handles OAuth callbacks from Google, Apple, and other providers.
 * The `next` query param determines where to redirect after login.
 * - Staff login passes `next=/staff/dashboard`
 * - Family login passes `next=/family/dashboard`
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/staff/dashboard";

  // Determine if this is a family login flow (for error redirect)
  const isFamily = next.startsWith("/family");
  const errorRedirect = isFamily ? "/login" : "/staff-login";

  if (!code) {
    return NextResponse.redirect(`${origin}${errorRedirect}?error=no_code`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as never)
            );
          } catch {
            // Ignore errors in Server Components
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}${errorRedirect}?error=auth_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
