-- ==============================================================================
-- OWLSCOPE SUPABASE DATABASE SETUP & MIGRATION SCRIPT
-- ==============================================================================
-- Paste and run this script in Supabase Dashboard -> SQL Editor -> New Query.
-- ==============================================================================

-- 1. Create the main json_documents table for all OwlScope stores
CREATE TABLE IF NOT EXISTS public.json_documents (
  store TEXT NOT NULL,
  id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store, id)
);

-- 2. Create optimized indexes for lightning-fast queries
CREATE INDEX IF NOT EXISTS idx_json_documents_store 
  ON public.json_documents (store);

CREATE INDEX IF NOT EXISTS idx_json_documents_updated 
  ON public.json_documents (updated_at DESC);

-- GIN index for deep JSON search and filtering
CREATE INDEX IF NOT EXISTS idx_json_documents_data_gin 
  ON public.json_documents USING gin (data jsonb_path_ops);

-- 3. Automatic updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.update_json_documents_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_json_documents_updated_at ON public.json_documents;
CREATE TRIGGER trg_json_documents_updated_at
  BEFORE UPDATE ON public.json_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_json_documents_timestamp();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.json_documents ENABLE ROW LEVEL SECURITY;

-- Drop any previous restrictive policies
DROP POLICY IF EXISTS "Authenticated users full access" ON public.json_documents;
DROP POLICY IF EXISTS "Allow all access to json_documents" ON public.json_documents;
DROP POLICY IF EXISTS "Enable all operations for authenticated and anon" ON public.json_documents;

-- 5. Create unrestricted policy for seamless OwlScope cloud sync & writing office
-- (This ensures both authenticated users and server API keys can read/write without RLS 42501 errors)
CREATE POLICY "Enable all operations for authenticated and anon"
  ON public.json_documents
  FOR ALL
  TO public, anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- 6. Grant table permissions
GRANT ALL ON TABLE public.json_documents TO postgres, anon, authenticated, service_role;
