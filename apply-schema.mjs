// Fast schema applier — tries every known Supabase endpoint
const URL = 'https://zurdihlvbsoojllcgavs.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1cmRpaGx2YnNvb2psbGNnYXZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjExNjI3MiwiZXhwIjoyMDg3NjkyMjcyfQ.UEe355AFxYGG6tzK316E0b_AcRTgLKYhKcZ_ChX6_qU';

const sql = `
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN CREATE TYPE public.invoice_status AS ENUM ('unpaid', 'overdue', 'paid'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chase_level') THEN CREATE TYPE public.chase_level AS ENUM ('day1', 'day7', 'day14', 'day30_plus'); END IF; END $$;
CREATE TABLE IF NOT EXISTS public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, business_name text, logo_url text, sender_name text, reply_to_email text, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Users can view own profile' AND tablename='profiles') THEN CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid()=id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Users can update own profile' AND tablename='profiles') THEN CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid()=id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Users can insert own profile' AND tablename='profiles') THEN CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid()=id); END IF; END $$;
CREATE TABLE IF NOT EXISTS public.invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, client_name text NOT NULL, client_email text NOT NULL, invoice_number text NOT NULL, amount_due numeric(12,2) NOT NULL, due_date date NOT NULL, status public.invoice_status NOT NULL DEFAULT 'unpaid', auto_chase_enabled boolean NOT NULL DEFAULT true, client_portal_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex') UNIQUE, notes text, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS invoices_user_id_idx ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS invoices_due_date_idx ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS invoices_client_portal_token_idx ON public.invoices(client_portal_token);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Users can CRUD own invoices' AND tablename='invoices') THEN CREATE POLICY "Users can CRUD own invoices" ON public.invoices FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); END IF; END $$;
CREATE TABLE IF NOT EXISTS public.email_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, level public.chase_level NOT NULL, subject text NOT NULL, body text NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, UNIQUE(user_id,level));
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS email_templates_user_id_idx ON public.email_templates(user_id);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Users can CRUD own templates' AND tablename='email_templates') THEN CREATE POLICY "Users can CRUD own templates" ON public.email_templates FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); END IF; END $$;
CREATE TABLE IF NOT EXISTS public.email_activity (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, client_email text NOT NULL, level public.chase_level NOT NULL, sent_at timestamptz DEFAULT now() NOT NULL, opened_at timestamptz, status text NOT NULL DEFAULT 'sent', raw_response jsonb, created_at timestamptz DEFAULT now() NOT NULL);
ALTER TABLE public.email_activity ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS email_activity_user_id_idx ON public.email_activity(user_id);
CREATE INDEX IF NOT EXISTS email_activity_invoice_id_idx ON public.email_activity(invoice_id);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Users can see own email activity' AND tablename='email_activity') THEN CREATE POLICY "Users can see own email activity" ON public.email_activity FOR SELECT USING (auth.uid()=user_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Users can insert own email activity' AND tablename='email_activity') THEN CREATE POLICY "Users can insert own email activity" ON public.email_activity FOR INSERT WITH CHECK (auth.uid()=user_id); END IF; END $$;
CREATE TABLE IF NOT EXISTS public.chase_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_at timestamptz DEFAULT now() NOT NULL, summary text, details jsonb);
ALTER TABLE public.chase_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Allow only service role to access chase_runs' AND tablename='chase_runs') THEN CREATE POLICY "Allow only service role to access chase_runs" ON public.chase_runs FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role'); END IF; END $$;
CREATE OR REPLACE VIEW public.invoice_portal_view AS SELECT i.id,i.client_name,i.client_email,i.invoice_number,i.amount_due,i.due_date,i.status,i.client_portal_token,p.business_name,p.logo_url FROM public.invoices i JOIN public.profiles p ON p.id=i.user_id;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger AS $fn$ BEGIN INSERT INTO public.profiles(id,business_name,sender_name,reply_to_email) VALUES(new.id,COALESCE(new.raw_user_meta_data->>'business_name',new.email),split_part(new.email,'@',1),new.email) ON CONFLICT(id) DO NOTHING; RETURN new; END; $fn$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
`;

const endpoints = [
  { url: `${URL}/pg-meta/default/query`, label: 'pg-meta/default/query' },
  { url: `${URL}/pg/query`, label: 'pg/query' },
  { url: `${URL}/pg`, label: '/pg' },
];

async function tryEndpoint(ep, body) {
  try {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(`[${ep.label}] Status: ${res.status}`);
    if (text.length < 500) console.log(`  Response: ${text}`);
    else console.log(`  Response (truncated): ${text.substring(0, 300)}`);
    return res.ok;
  } catch (err) {
    console.log(`[${ep.label}] Error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('Attempting to apply schema...\n');

  for (const ep of endpoints) {
    // Try with {query: sql}
    let ok = await tryEndpoint(ep, { query: sql });
    if (ok) { console.log(`\nSUCCESS via ${ep.label}!`); return; }

    // Try with {sql: sql} 
    ok = await tryEndpoint(ep, { sql: sql });
    if (ok) { console.log(`\nSUCCESS via ${ep.label} (sql key)!`); return; }
  }

  console.log('\n--- Direct API methods exhausted. ---');
}

main();
