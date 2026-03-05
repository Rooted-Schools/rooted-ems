// Browser client — safe for "use client" components
export { createBrowserClient } from "./clients/browser";

// Server and service clients must be imported directly from their paths:
//   import { createServerClient } from "@rooted-ems/database/server"
//   import { createServiceClient } from "@rooted-ems/database/service"
// This prevents next/headers from being bundled into client components.
