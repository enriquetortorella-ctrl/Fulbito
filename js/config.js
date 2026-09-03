// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = 'https://yhedcxxbjprgbodfrumu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZWRjeHhianByZ2JvZGZydW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzI5ODgsImV4cCI6MjA5MDkwODk4OH0.RlIHWB6w9jQXgxb1-FbaCMI4mk_SHGRcYSryzETQ-oo';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let anonymousSessionReady = null;
// Toda RPC que cambia datos invalida las lecturas que ya estaban en vuelo.
// Sin esta barrera, un auto-sync iniciado justo antes de cerrar un partido
// podía pintar por unos segundos la versión anterior (por ejemplo, "abierto")
// aunque el servidor ya lo hubiera guardado como cerrado.
let _appMutationGeneration = 0;
let _appMutationsPending = 0;

// Lista cerrada: cualquier RPC nueva se trata como escritura hasta que se
// revise expresamente. Es más seguro que inferir por prefijo (una futura
// `fulbito_get_or_create_*`, por ejemplo, no debe saltarse la barrera).
const READ_ONLY_FULBITO_RPCS = new Set([
  'fulbito_get_club_brand',
  'fulbito_get_matches',
  'fulbito_get_my_player',
  'fulbito_get_players',
  'fulbito_is_admin',
  'fulbito_is_member',
  'fulbito_is_platform_admin',
  'fulbito_list_clubs',
  'fulbito_lookup_club',
  'fulbito_platform_list_clubs'
]);

function isReadOnlyFulbitoRpc(name) {
  return READ_ONLY_FULBITO_RPCS.has(String(name || ''));
}

function captureAppMutationBarrier() {
  return {
    generation: _appMutationGeneration,
    mutationsWerePending: _appMutationsPending > 0
  };
}

function isAppMutationBarrierCurrent(token) {
  return !!token &&
    !token.mutationsWerePending &&
    token.generation === _appMutationGeneration &&
    _appMutationsPending === 0;
}

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
  const isMutation = !isReadOnlyFulbitoRpc(name);
  if (isMutation) {
    _appMutationGeneration++;
    _appMutationsPending++;
  }
  try {
    const client = await getSB();
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || 'No se pudo completar la operación');
    return data;
  } finally {
    if (isMutation) _appMutationsPending--;
  }
}

// ============================================================
