-- Supabase (and similar hosts) expose tables in the public schema through an
-- auto-generated REST API. Row-level security with no policies closes that path:
-- nothing is readable or writable through it. The app connects as the table
-- owner, which RLS does not restrict, so the app itself is unaffected.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
