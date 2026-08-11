import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; cookie writes are silently
            // ignored. The middleware refreshes them on the next request.
          }
        },
      },
    },
  );
}

/**
 * Admin / Storage client.
 * Uses the service_role key when available to bypass RLS, or falls back to
 * the anon key.
 */
export function createSupabaseAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Use service_role key if it's a valid Supabase JWT, otherwise fallback to anon key
  const authKey = (serviceKey && serviceKey.startsWith("ey")) ? serviceKey : (anonKey || serviceKey || "");

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    authKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}


