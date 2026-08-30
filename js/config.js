// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = 'https://yhedcxxbjprgbodfrumu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZWRjeHhianByZ2JvZGZydW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzI5ODgsImV4cCI6MjA5MDkwODk4OH0.RlIHWB6w9jQXgxb1-FbaCMI4mk_SHGRcYSryzETQ-oo';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let anonymousSessionReady = null;

// La clave anónima es pública por diseño. La identidad anónima y las RPC con
// RLS son las que autorizan cada acción del usuario en el servidor.
async function getSB() {
  if (!anonymousSessionReady) {
    anonymousSessionReady = (async () => {
      const { data: { session }, error: sessionError } = await sb.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) throw error;
      }
    })().catch(error => {
      anonymousSessionReady = null;
      throw error;
    });
  }
  await anonymousSessionReady;
  return sb;
}

async function callRpc(name, args = {}) {
  const client = await getSB();
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message || 'No se pudo completar la operación');
  return data;
}

// ============================================================
