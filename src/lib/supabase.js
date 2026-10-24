import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const bucket = import.meta.env.VITE_SUPABASE_OTS_BUCKET || 'orcawarden-ots';

let client;
if (url && anonKey) {
  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function getSupabaseClient() {
  return client;
}

export function getStorageBucket() {
  return bucket;
}
