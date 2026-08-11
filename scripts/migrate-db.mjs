import pg from "pg";
const { Client } = pg;

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY || "postgresql://postgres:NOzpznD9PLEHjiDg@db.gmjlrwszfghwhvtbuwsu.supabase.co:5432/postgres";

async function runMigration() {
  console.log("Connecting to PostgreSQL database...");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected successfully!");

    console.log("Creating table and indexes...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS json_documents (
        id TEXT NOT NULL,
        store TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (store, id)
      );

      CREATE INDEX IF NOT EXISTS idx_json_documents_store ON json_documents(store);
      CREATE INDEX IF NOT EXISTS idx_json_documents_updated ON json_documents(updated_at);

      ALTER TABLE json_documents ENABLE ROW LEVEL SECURITY;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'json_documents' AND policyname = 'Allow all access to json_documents'
        ) THEN
          CREATE POLICY "Allow all access to json_documents"
            ON json_documents FOR ALL
            USING (true)
            WITH CHECK (true);
        END IF;
      END
      $$;
    `);

    console.log("Migration executed successfully! Table json_documents is ready.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
