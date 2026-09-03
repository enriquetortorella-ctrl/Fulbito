const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

async function storageDistinguishesRevocationFromFailure() {
  const errors = [];
  const context = vm.createContext({
    console: { error: (...args) => errors.push(args) },
    state: { currentClub: { id: 'club-a' } },
    callRpc: async () => null
  });
  vm.runInContext(read('js/storage.js'), context, { filename: 'storage.js' });

  let snapshot = await context.loadCurrentPlayerAccess('club-a');
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.player, null, 'null explícito debe representar una vinculación revocada');

  context.callRpc = async () => { throw new Error('network down'); };
  snapshot = await context.loadCurrentPlayerAccess('club-a');
  assert.equal(snapshot.ok, false, 'una excepción transitoria no debe parecer una revocación');
  assert.equal(snapshot.player, null);
  assert.match(snapshot.error.message, /network down/);
  assert.equal(errors.length, 1);

  const raw = { id: 'p1', username: 'titi', name: 'Titi', is_admin: true };
  context.callRpc = async () => raw;
  snapshot = await context.loadCurrentPlayerAccess('club-a');
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.player.id, 'p1');
}

function createNode(id = '') {
  const classes = new Set();
  return {
    id,
    style: {},
    textContent: '',
    innerHTML: '',
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      toggle: (value, force) => force ? classes.add(value) : classes.delete(value),
      contains: value => classes.has(value)
    }
  };
}

function navigationContext() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, createNode(id));
    return nodes.get(id);
  };
  let activeTab = 'inicio';
  const tabs = ['inicio','jugadores','asistencia','calificar','equipos','goles','partidos','goleadores','posiciones','stats','admin']
    .map(name => ({
      classList: { toggle: (klass, selected) => { if (klass === 'active' && selected) activeTab = name; } },
      getAttribute: attribute => attribute === 'onclick' ? `switchTab('${name}')` : null
    }));
  const contents = tabs.map(() => createNode());
  const calls = { sessionSet: [], sessionDel: 0, stopSync: 0, login: 0, toast: [], resetTeams: 0 };
  const context = vm.createContext({
    console,
    state: {
      currentClub: { id: 'club-a', name: 'Club A', crest: null, crestDesign: null, inviteCode: 'SECRETO', matchWeekday: 6, matchTime: '20:00', matchVenue: 'Cancha', matchAddress: 'Calle 1' },
      currentUser: { id: 'me', username: 'yo', name: 'Yo', isAdmin: true, isPlatformAdmin: false, clubId: 'club-a' },
      players: []
    },
    matches: [{ id: 'old-match' }],
    golesMatchId: 'old-match',
    document: {
      getElementById: node,
      querySelector: selector => selector === '.nav-tab.active'
        ? { getAttribute: () => `switchTab('${activeTab}')` }
        : null,
      querySelectorAll: selector => selector === '.nav-tab'
        ? tabs
        : selector === '.tab-content' ? contents : []
    },
    SESSION: {
      set: value => calls.sessionSet.push(value),
      del: () => { calls.sessionDel++; }
    },
    stopSync: () => { calls.stopSync++; },
    showScreen: id => { calls.screen = id; },
    showLoginForm: () => { calls.login++; },
    showToast: message => calls.toast.push(message),
    closeModal() {},
    resetTeamDraftState: () => { calls.resetTeams++; },
    mapPlayers: rows => rows.map(row => ({
      id: row.id,
      username: row.username,
      name: row.name,
      photo: row.photo || null,
      isAdmin: !!row.is_admin
    })),
    safePhotoUrl: value => value || '',
    escapeHtml: value => String(value ?? ''),
    renderHub() {}, renderPlayers() {}, renderAttendance() {}, renderRate() {},
    renderTeamsTab() {}, renderGoles() {}, renderPartidos() {}, renderGoleadoresTab() {},
    renderRanking() {}, renderStats() {}, renderAdmin() {},
    loadClubBrand: async () => null,
    loadMatches: async () => [],
    renderAll() {}, renderClubIdentity() {}, startSync() {},
  });
  vm.runInContext(read('js/navigation.js'), context, { filename: 'navigation.js' });
  context.showScreen = id => { calls.screen = id; };
  return { context, calls, node, setActiveTab: value => { activeTab = value; } };
}

function accessReconciliationIsTransactional() {
  const { context, calls, node, setActiveTab } = navigationContext();

  const originalUser = context.state.currentUser;
  assert.equal(context.reconcileCurrentUserAccess(null, { ok: false, player: null, error: new Error('offline') }), true);
  assert.equal(context.state.currentUser, originalUser, 'un fallo transitorio debe conservar la sesión');
  assert.equal(calls.sessionDel, 0);

  setActiveTab('admin');
  const demoted = {
    id: 'me', username: 'yo-actualizado', name: 'Yo actualizado', photo: 'https://example.com/me.webp',
    is_admin: false, is_platform_admin: true
  };
  assert.equal(context.reconcileCurrentUserAccess([], { ok: true, player: demoted }), true);
  assert.equal(context.state.currentUser.isAdmin, false);
  assert.equal(context.state.currentUser.isPlatformAdmin, true);
  assert.equal(context.state.currentUser.name, 'Yo actualizado');
  assert.equal(context.state.currentClub.inviteCode, null, 'al perder Admin no debe quedar el código en memoria');
  assert.equal(node('admin-tab').style.display, 'none');
  assert.equal(node('platform-admin-launch').style.display, 'inline-flex');
  assert.equal(calls.sessionSet.at(-1).clubInviteCode, null);

  context.state.currentUser = { id: 'me', username: 'yo', name: 'Yo', isAdmin: false, supportMode: false, clubId: 'club-a' };
  context.state.players = [{ id: 'me' }];
  context.matches = [{ id: 'cached' }];
  context.golesMatchId = 'cached';
  assert.equal(context.reconcileCurrentUserAccess(null, { ok: true, player: null }), false);
  assert.equal(context.state.currentUser, null);
  assert.deepEqual(Array.from(context.state.players), []);
  assert.deepEqual(Array.from(context.matches), []);
  assert.equal(context.golesMatchId, null);
  assert.equal(calls.sessionDel, 1);
  assert.equal(calls.stopSync, 1);
  assert.equal(calls.screen, 'screen-login');
  assert.equal(calls.login, 1);

  context.state.currentUser = { id: 'master', isAdmin: true, supportMode: true };
  assert.equal(context.reconcileCurrentUserAccess(null, { ok: true, player: null }), true, 'soporte no pertenece al club asistido');
  assert.equal(context.state.currentUser.id, 'master');
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function staleSyncCannotHydrateAnotherClub() {
  const players = deferred();
  const matches = deferred();
  const brand = deferred();
  const access = deferred();
  let tick = null;
  let reconciliations = 0;
  const context = vm.createContext({
    console,
    state: { currentClub: { id: 'club-a', name: 'A' }, currentUser: { id: 'me', isAdmin: false }, players: [{ id: 'sentinel' }] },
    matches: [{ id: 'sentinel-match' }],
    _goalSaveTimer: null,
    _goalWritesPending: 0,
    _goalWriteGeneration: 0,
    _goalReadGeneration: 0,
    _ratingWritesPending: 0,
    _ratingWriteGeneration: 0,
    window: {
      setInterval: callback => { tick = callback; return 1; },
      clearInterval() {}
    },
    document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
    loadPlayers: clubId => { assert.equal(clubId, 'club-a'); return players.promise; },
    loadMatches: clubId => { assert.equal(clubId, 'club-a'); return matches.promise; },
    loadClubBrand: clubId => { assert.equal(clubId, 'club-a'); return brand.promise; },
    loadCurrentPlayerAccess: clubId => { assert.equal(clubId, 'club-a'); return access.promise; },
    reconcileCurrentUserAccess: () => { reconciliations++; return true; },
    sameClubCrestDesign: () => true,
    SESSION: { set() {} },
    getActiveTabName: () => 'inicio',
    renderHub() {}, renderPlayers() {}, renderAttendance() {}, renderRate() {}, renderAdmin() {},
    renderPartidos() {}, renderGoleadoresTab() {}, renderRanking() {}, renderStats() {}, renderGoles() {},
  });
  vm.runInContext(read('js/sync.js'), context, { filename: 'sync.js' });
  await context.startSync();
  assert.equal(typeof tick, 'function');
  const running = tick();
  context.state.currentClub = { id: 'club-b', name: 'B' };
  players.resolve([{ id: 'from-a' }]);
  matches.resolve([{ id: 'match-from-a' }]);
  brand.resolve({ id: 'club-a', name: 'A nueva' });
  access.resolve({ ok: true, player: { id: 'me' } });
  await running;
  assert.equal(context.state.players[0].id, 'sentinel');
  assert.equal(context.matches[0].id, 'sentinel-match');
  assert.equal(reconciliations, 0, 'una respuesta vieja ni siquiera debe reconciliar el usuario nuevo');
}

async function staleLoginCannotOpenAnotherClub() {
  const login = deferred();
  const nodes = new Map([
    ['login-user', { value: 'usuario', style: {} }],
    ['login-pass', { value: 'secreto', style: {} }],
    ['login-error', { innerHTML: '', textContent: '', style: {} }]
  ]);
  const context = vm.createContext({
    console,
    state: { currentClub: { id: 'club-a', name: 'A' }, currentUser: null },
    document: { getElementById: id => nodes.get(id) || createNode(id), querySelectorAll: () => [] },
    callRpc: (name, params) => {
      assert.equal(name, 'fulbito_login_player');
      assert.equal(params.p_club_id, 'club-a');
      return login.promise;
    },
    showClubChooser() {}, updateLoginClubContext() {}, renderRegRatingMode() {},
  });
  vm.runInContext(read('js/auth.js'), context, { filename: 'auth.js' });
  const running = context.doLogin();
  context.state.currentClub = { id: 'club-b', name: 'B' };
  context.invalidateAuthAttempt();
  login.resolve({ id: 'from-a', username: 'usuario', name: 'Usuario', is_admin: false });
  await running;
  assert.equal(context.state.currentUser, null, 'un login viejo no debe abrir el club seleccionado después');
  assert.equal(nodes.get('login-error').style.display, 'none', 'un error viejo tampoco debe ensuciar el formulario nuevo');
}

(async () => {
  await storageDistinguishesRevocationFromFailure();
  accessReconciliationIsTransactional();
  await staleSyncCannotHydrateAnotherClub();
  await staleLoginCannotOpenAnotherClub();
  console.log('PASS session-access');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
