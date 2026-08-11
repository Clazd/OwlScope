import { createClient } from "@supabase/supabase-js";

const url = "https://gmjlrwszfghwhvtbuwsu.supabase.co";
const anonKey = "sb_publishable_7-nm2_lggH8xCtneT7ANMw_q_K_mEyh";

async function testInsert() {
  const supabase = createClient(url, anonKey);
  console.log("Testing insert into json_documents...");
  const { data, error } = await supabase.from("json_documents").upsert({
    store: "test-store",
    id: "test-id",
    data: { id: "test-id", title: "Test Connection", timestamp: new Date().toISOString() },
    updated_at: new Date().toISOString()
  }).select();

  console.log("Upsert result:", { data, error });

  if (!error) {
    const del = await supabase.from("json_documents").delete().eq("store", "test-store").eq("id", "test-id");
    console.log("Cleanup delete result:", del);
  }
}

testInsert();
