const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {
    id,
    innerHTML: '',
    value: '',
    hidden: false,
    style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    focus() {},
    remove() {},
    insertAdjacentHTML(_where, html) { this.innerHTML = html + this.innerHTML; }
  });
  return nodes.get(id);
};

const toasts = [];
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  URL,
  Uint8Array,
  Int32Array,
  document: {
    activeElement: null,
    getElementById: id => node(id),
    createElement: () => node(`created-${nodes.size}`),
    body: { appendChild() {} },
    execCommand: () => true
  },
  navigator: {},
  state: {
    currentClub: { id: 'club-1', name: 'Club original', crest: null, crestDesign: null, inviteCode: 'ORIGINAL', matchWeekday: 6, matchTime: '20:00', matchVenue: 'Cancha', matchAddress: 'Calle 1' },
    currentUser: { id: 'admin-1', isAdmin: true, supportMode: false },
    clubs: [],
    players: []
  },
  CLUB_WEEKDAYS: ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'],
  safePlainText: (value, max = 80) => String(value ?? '').replace(/[<>&"'`\u0000-\u001F\u007F]/g, '').slice(0, max),
  safeClubCrestUrl: value => String(value || '').startsWith('data:image/') ? value : '',
  escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])),
  clubInitials: name => String(name || 'FC').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase(),
  getClubSchedule() {
    const c = context.state.currentClub;
    return c.matchWeekday == null ? null : { weekday: c.matchWeekday, time: c.matchTime, venue: c.matchVenue, address: c.matchAddress };
  },
  clubNextMatchText: () => 'sábado · 20:00',
  getEffectivePosition: p => p.posPrimary || 'MED',
  mapPlayers: rows => rows.map(row => ({
    id: row.id,
    username: row.username,
    name: row.name,
    isAdmin: !!row.is_admin,
    posPrimary: row.pos_primary,
    posSecondary: row.pos_secondary,
    ratings: row.ratings || {}
  })),
  showToast: message => toasts.push(message),
  renderClubIdentity() {},
  renderHub() {},
  renderPlayers() {},
  openModal() {},
  closeModal() {},
  KNOWN_CLUBS: { remember() {} },
  SESSION: { set() {} },
  loadClubBrand: async () => null,
  Image: class {},
});

vm.runInContext(fs.readFileSync(path.join(root, 'js/tabs/admin.js'), 'utf8'), context, { filename: 'admin.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'js/tabs/jugadores.js'), 'utf8'), context, { filename: 'jugadores.js' });

function player(id, isAdmin = false, name = id) {
  return { id, username: id, name, isAdmin, posPrimary: 'MED', posSecondary: 'DEF', ratings: {} };
}

async function roleChangeIsTransactional() {
  const actor = player('admin-1', true, 'Administrador');
  const target = player('player-2', false, 'Jugador dos');
  context.state.players = [actor, target];
  let rpcCalls = 0;
  context.confirmAppAction = async () => false;
  context.callRpc = async () => { rpcCalls++; };
  await context.toggleAdmin(target.id);
  assert.equal(rpcCalls, 0, 'cancelar no debe llamar al servidor');
  assert.equal(target.isAdmin, false, 'cancelar no debe mutar el rol');

  let resolveRpc;
  context.confirmAppAction = async () => true;
  context.callRpc = () => {
    rpcCalls++;
    return new Promise(resolve => { resolveRpc = resolve; });
  };
  const saving = context.toggleAdmin(target.id);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(target.isAdmin, false, 'el rol no puede cambiar antes de la respuesta');
  resolveRpc({ id: target.id, username: target.username, name: target.name, is_admin: true, pos_primary: 'MED', pos_secondary: 'DEF', ratings: {} });
  await saving;
  assert.equal(target.isAdmin, true, 'el rol cambia sólo con confirmación del servidor');

  let confirmations = 0;
  context.confirmAppAction = async () => { confirmations++; return true; };
  await context.toggleAdmin(actor.id);
  assert.equal(confirmations, 0, 'el propio rol debe bloquearse antes de abrir confirmación');
}

async function removalClearsDraftOnlyAfterServer() {
  const actor = player('admin-1', true, 'Administrador');
  const target = player('player-delete', false, 'Jugador a borrar');
  context.state.currentUser = { id: actor.id, isAdmin: true, supportMode: false };
  context.state.players = [actor, target];
  let resolveDelete;
  let draftResets = 0;
  context.resetTeamDraftState = () => { draftResets++; };
  context.deletePlayer = () => new Promise(resolve => { resolveDelete = resolve; });
  context.removePlayer(target.id);
  const deleting = context.confirmPlayerRemoval();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(draftResets, 0, 'el borrador no cambia antes de confirmar el borrado remoto');
  assert.ok(context.state.players.some(p => p.id === target.id));
  resolveDelete(true);
  await deleting;
  assert.equal(draftResets, 1, 'un borrado confirmado debe limpiar equipos pendientes');
  assert.ok(!context.state.players.some(p => p.id === target.id));
}

function draftsSurviveRenders() {
  context.state.currentUser = { id: 'admin-1', isAdmin: true, supportMode: false };
  context.state.players = [player('admin-1', true)];
  context.renderAdmin();
  context.trackClubBrandName('Nombre todavía sin guardar');
  node('club-match-weekday').value = '5';
  node('club-match-time').value = '21:30';
  node('club-match-venue').value = 'Cancha con un nombre largo';
  node('club-match-address').value = 'Dirección privada 123';
  context.trackClubScheduleDraft();
  context.toggleClubInviteEditor(true);
  context.trackClubInviteDraft('NUEVO-2026');

  context.state.currentClub = { ...context.state.currentClub, name: 'Nombre remoto', inviteCode: 'REMOTO', matchTime: '22:00' };
  context.renderAdmin();
  const html = node('club-admin-info').innerHTML;
  assert.match(html, /Nombre todavía sin guardar/);
  assert.match(html, /value="NUEVO-2026"/);
  assert.match(html, /value="21:30"/);
  assert.match(html, /Cancha con un nombre largo/);
  assert.equal(context.isAdminEditingDraft(), true);
}

function permissionsAndEscapingAreVisible() {
  context.resetClubAdminDrafts('club-1');
  context.state.currentUser = { id: 'master', isAdmin: true, supportMode: true };
  context.state.players = [player('p-long', false, '<Nombre extremadamente largo & peligroso>')];
  context.renderAdmin();
  const clubHtml = node('club-admin-info').innerHTML;
  const playersHtml = node('admin-players-list').innerHTML;
  assert.match(clubHtml, /Modo soporte maestro/);
  assert.doesNotMatch(clubHtml, /saveClubIdentity/);
  assert.doesNotMatch(playersHtml, /toggleAdmin|removePlayer|adminChangePassword/);
  assert.match(playersHtml, /&lt;Nombre extremadamente largo &amp; peligroso&gt;/);
  assert.equal(node('admin-votes-section').hidden, false, 'el maestro debe poder auditar también la exportación de votos');
  assert.equal(node('admin-danger-zone').hidden, false, 'soporte sí puede ejecutar borrados masivos autorizados');

  context.state.currentUser = { id: 'member', isAdmin: false, supportMode: false };
  context.renderAdmin();
  assert.equal(node('admin-danger-zone').hidden, true, 'un jugador no debe ver acciones masivas');
}

(async () => {
  await roleChangeIsTransactional();
  await removalClearsDraftOnlyAfterServer();
  draftsSurviveRenders();
  permissionsAndEscapingAreVisible();
  console.log('admin-integrity: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
