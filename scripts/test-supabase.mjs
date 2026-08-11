import { createClient } from "@supabase/supabase-js";

const url = "https://gmjlrwszfghwhvtbuwsu.supabase.co";
const anonKey = "sb_publishable_7-nm2_lggH8xCtneT7ANMw_q_K_mEyh";

async function test() {
  console.log("Testing Supabase API connection...");
  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.from("json_documents").select("*").limit(1);
  console.log("Result:", { data, error });
}

test();
