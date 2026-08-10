import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const EMAIL_DOMAIN = "@owlscope.app";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
    }

    const email = `${username.trim().toLowerCase()}${EMAIL_DOMAIN}`;
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Login failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
