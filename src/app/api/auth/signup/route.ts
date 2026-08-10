import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const EMAIL_DOMAIN = "@owlscope.app";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || typeof username !== "string" || username.trim().length < 2) {
      return NextResponse.json({ error: "Username must be at least 2 characters." }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const email = `${username.trim().toLowerCase()}${EMAIL_DOMAIN}`;
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.trim() },
      },
    });

    if (error) {
      // Supabase returns 'User already registered' for duplicates.
      const message = error.message.includes("already registered")
        ? "That username is already taken."
        : error.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Signup failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
