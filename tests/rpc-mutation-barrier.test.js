const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

(async () => {
  let response = deferred();
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'anon' } } }, error: null }),
      signInAnonymously: async () => ({ error: null })
    },
    rpc: async () => response.promise
  };
  const context = vm.createContext({ console, supabase: { createClient: () => client } });
  vm.runInContext(source, context, { filename: 'config.js' });

  const write = context.callRpc('fulbito_upsert_match', { p_club_id: 'club-a' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext('_appMutationGeneration', context), 1);
  assert.equal(vm.runInContext('_appMutationsPending', context), 1);
  response.resolve({ data: { id: 'm1' }, error: null });
  assert.deepEqual(await write, { id: 'm1' });
  assert.equal(vm.runInContext('_appMutationsPending', context), 0);

  response = deferred();
  const read = context.callRpc('fulbito_get_matches', { p_club_id: 'club-a' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext('_appMutationGeneration', context), 1, 'una lectura no invalida snapshots');
  assert.equal(vm.runInContext('_appMutationsPending', context), 0);
  response.resolve({ data: [], error: null });
  assert.deepEqual(Array.from(await read), []);

  response = deferred();
  const failedWrite = context.callRpc('fulbito_delete_match', {}).catch(error => error);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext('_appMutationsPending', context), 1);
  response.resolve({ data: null, error: { message: 'rechazado' } });
  const error = await failedWrite;
  assert.match(error.message, /rechazado/);
  assert.equal(vm.runInContext('_appMutationsPending', context), 0, 'una falla también libera la barrera');

  const readOnlyNames = [
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
  ];
  for (const name of readOnlyNames) {
    assert.equal(context.isReadOnlyFulbitoRpc(name), true, `${name} debe ser lectura`);
  }
  assert.equal(context.isReadOnlyFulbitoRpc('fulbito_update_club_brand'), false);
  assert.equal(context.isReadOnlyFulbitoRpc('fulbito_get_or_create_club'), false,
    'una RPC nueva con nombre ambiguo debe quedar protegida como escritura');
  assert.equal(context.isReadOnlyFulbitoRpc(''), false);

  const generationBeforeConcurrentWrites = vm.runInContext('_appMutationGeneration', context);
  response = deferred();
  const firstResponse = response;
  const firstWrite = context.callRpc('fulbito_update_club_brand', {});
  await new Promise(resolve => setImmediate(resolve));
  const tokenDuringFirstWrite = context.captureAppMutationBarrier();
  assert.equal(context.isAppMutationBarrierCurrent(tokenDuringFirstWrite), false,
    'un token capturado con una escritura pendiente nunca habilita un snapshot');

  response = deferred();
  const secondResponse = response;
  const secondWrite = context.callRpc('fulbito_set_attendance', {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext('_appMutationsPending', context), 2, 'las escrituras concurrentes se contabilizan por separado');
  assert.equal(vm.runInContext('_appMutationGeneration', context), generationBeforeConcurrentWrites + 2);

  firstResponse.resolve({ data: true, error: null });
  assert.equal(await firstWrite, true);
  assert.equal(vm.runInContext('_appMutationsPending', context), 1,
    'terminar una escritura no debe liberar la barrera de otra todavía activa');
  secondResponse.resolve({ data: true, error: null });
  assert.equal(await secondWrite, true);
  assert.equal(vm.runInContext('_appMutationsPending', context), 0);
  assert.equal(context.isAppMutationBarrierCurrent(tokenDuringFirstWrite), false,
    'un token nacido durante una escritura sigue siendo inválido después');
  const stableToken = context.captureAppMutationBarrier();
  assert.equal(context.isAppMutationBarrierCurrent(stableToken), true);

  // Las lecturas iniciales de showApp también deben invalidarse si comienza
  // cualquier mutación, no sólo una escritura de goles.
  context.state = { currentClub: { id: 'club-a' } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'navigation.js'), 'utf8'), context, { filename: 'navigation.js' });
  context.state.currentClub = { id: 'club-a', inviteCode: 'SOPORTE-OK' };
  context.state.currentUser = { id: 'master', isAdmin: true, supportMode: true };
  const protectedSupportClub = context.clubSnapshotForCurrentContext({ id: 'club-a', name: 'Club A', inviteCode: null });
  assert.equal(protectedSupportClub.inviteCode, 'SOPORTE-OK',
    'la lectura común no debe borrar el código que recibió el maestro por su RPC privada');
  assert.equal(context.shouldPersistCurrentSession(), false,
    'el club asistido no debe reemplazar la sesión persistida del maestro');
  context.state.currentUser.supportMode = false;
  assert.equal(context.clubSnapshotForCurrentContext({ id: 'club-a', inviteCode: null }).inviteCode, null,
    'fuera de soporte, un null confirmado sí debe limpiar el código');
  assert.equal(context.shouldPersistCurrentSession(), true);
  context.state.currentClub = { id: 'club-a' };
  const navigationToken = context.beginAppClubRead();
  assert.equal(context.isCurrentAppClubRead(navigationToken), true);
  response = deferred();
  const navigationWrite = context.callRpc('fulbito_update_club_brand', {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.isCurrentAppClubRead(navigationToken), false,
    'una respuesta inicial vieja no debe repintar identidad ni partidos');
  response.resolve({ data: true, error: null });
  await navigationWrite;

  response = deferred();
  const alreadyPendingWrite = context.callRpc('fulbito_set_attendance', {});
  await new Promise(resolve => setImmediate(resolve));
  const pendingNavigationToken = context.beginAppClubRead();
  response.resolve({ data: true, error: null });
  await alreadyPendingWrite;
  assert.equal(context.isCurrentAppClubRead(pendingNavigationToken), false,
    'una lectura iniciada durante una escritura no se vuelve válida cuando ésta termina');

  // La planilla de goles no debe siquiera consultar mientras otra mutación
  // está activa, ni aceptar una respuesta que quedó vieja durante la espera.
  context.matches = [{ id: 'cached' }];
  let matchLoads = 0;
  context.loadMatches = async () => { matchLoads++; return [{ id: 'fresh' }]; };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'tabs', 'goles.js'), 'utf8'), context, { filename: 'goles.js' });

  response = deferred();
  const blockingWrite = context.callRpc('fulbito_set_attendance', {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await context.loadGoalMatchesSnapshot(), null);
  assert.equal(matchLoads, 0, 'no debe lanzar una lectura conocida como insegura');
  assert.equal(context.matches[0].id, 'cached');
  response.resolve({ data: true, error: null });
  await blockingWrite;

  const slowMatches = deferred();
  context.loadMatches = async () => { matchLoads++; return slowMatches.promise; };
  const staleGoalRead = context.loadGoalMatchesSnapshot();
  await new Promise(resolve => setImmediate(resolve));
  response = deferred();
  const overlappingWrite = context.callRpc('fulbito_update_club_match_schedule', {});
  await new Promise(resolve => setImmediate(resolve));
  slowMatches.resolve([{ id: 'stale' }]);
  assert.equal(await staleGoalRead, null);
  assert.equal(context.matches[0].id, 'cached', 'una respuesta invalidada no debe reemplazar la caché');
  response.resolve({ data: true, error: null });
  await overlappingWrite;

  context.loadMatches = async () => [];
  const validEmpty = await context.loadGoalMatchesSnapshot();
  assert.ok(Array.isArray(validEmpty));
  assert.equal(validEmpty.length, 0, 'una lectura vacía válida sí debe limpiar la planilla');
  assert.equal(context.matches.length, 0);

  // También debe balancearse si la falla ocurre antes de llegar a la RPC
  // (por ejemplo, al obtener la sesión anónima).
  const authFailureContext = vm.createContext({
    console,
    supabase: {
      createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: null }, error: new Error('sesión caída') }),
          signInAnonymously: async () => ({ error: null })
        },
        rpc: async () => { throw new Error('no debería ejecutarse'); }
      })
    }
  });
  vm.runInContext(source, authFailureContext, { filename: 'config-auth-failure.js' });
  await assert.rejects(authFailureContext.callRpc('fulbito_delete_match', {}), /sesión caída/);
  assert.equal(vm.runInContext('_appMutationGeneration', authFailureContext), 1);
  assert.equal(vm.runInContext('_appMutationsPending', authFailureContext), 0,
    'una falla de sesión también debe liberar exactamente una escritura');

  console.log('PASS rpc-mutation-barrier');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
