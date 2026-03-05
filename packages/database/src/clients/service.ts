import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client that bypasses RLS.
 * Only use for server-side admin operations (cron jobs, webhooks, migrations).
 * NEVER expose to the browser.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
