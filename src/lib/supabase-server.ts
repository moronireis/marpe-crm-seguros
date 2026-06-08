import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _serverClient: SupabaseClient | null = null;

export function createServerClient() {
  if (!_serverClient) {
    _serverClient = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _serverClient;
}
