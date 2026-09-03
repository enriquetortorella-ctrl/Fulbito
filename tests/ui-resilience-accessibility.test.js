const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    toggle: (value, force) => force ? values.add(value) : values.delete(value),
    contains: value => values.has(value)
  };
}

function staticSemanticsAreComplete() {
  const html = read('index.html');
  assert.doesNotMatch(html, /CLUB HOUSE\s*·\s*SÁBADOS/i, 'el plantel no debe prometer un sábado fijo');
  assert.match(html, /id="roster-club-kicker">PLANTEL DEL CLUB</);
  assert.match(html, /class="nav-tabs" role="tablist"/);

  const tabNames = ['inicio','jugadores','asistencia','calificar','equipos','goles','partidos','goleadores','posiciones','stats','admin'];
  for (const name of tabNames) {
    const tabId = name === 'admin' ? 'admin-tab' : `nav-tab-${name}`;
    assert.match(html, new RegExp(`<button[^>]+id="${tabId}"[^>]+role="tab"[^>]+aria-controls="tab-${name}"[^>]+data-tab="${name}"`));
    assert.match(html, new RegExp(`id="tab-${name}"[^>]+role="tabpanel"[^>]+aria-labelledby="${tabId}"`));
  }
}

function navigationSupportsArrowKeysAndDynamicClubText() {
  const names = ['inicio','jugadores','asistencia'];
  const tabs = names.map((name, index) => ({
    dataset: { tab: name },
    style: {},
    hidden: false,
    tabIndex: index ? -1 : 0,
    focused: false,
    classList: classList(index ? [] : ['active']),
    attrs: { 'data-tab': name, 'aria-selected': String(index === 0) },
    getAttribute(key) { return this.attrs[key] ?? null; },
    setAttribute(key, value) { this.attrs[key] = value; },
    focus() { this.focused = true; }
  }));
  const panels = names.map((name, index) => ({ id: `tab-${name}`, hidden: index !== 0, classList: classList(index ? [] : ['active']) }));
  const nodes = new Map([
    ...panels.map(panel => [panel.id, panel]),
    ['brand-crest', { classList: classList(), innerHTML: '' }],
    ['club-caption', { textContent: '' }],
    ['roster-club-kicker', { textContent: '' }],
    ['topbar-club-switch', { textContent: '', title: '' }]
  ]);
  const context = vm.createContext({
    console,
    state: {
      currentClub: { id: 'club-a', name: 'Club Atlético Prueba', crest: null, matchWeekday: 3, matchTime: '21:30', matchVenue: 'Cancha' },
      currentUser: { id: 'me', isAdmin: false },
      players: []
    },
    matches: [],
    document: {
      querySelector: selector => selector === '.nav-tab.active' ? tabs.find(tab => tab.classList.contains('active')) : null,
      querySelectorAll: selector => selector === '.nav-tab' ? tabs : selector === '.tab-content' ? panels : [],
      getElementById: id => nodes.get(id) || null
    },
    safeClubCrestUrl: () => '',
    clubInitials: () => 'CP',
    escapeHtml: value => String(value ?? ''),
    getClubMatchSchedule: club => ({ weekday: club.matchWeekday, time: club.matchTime, venue: club.matchVenue }),
    CLUB_WEEKDAYS: ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'],
    renderHub() {}, renderPlayers() {}, renderAttendance() {}, renderRate() {}, renderTeamsTab() {}, renderGoles() {},
    renderPartidos() {}, renderGoleadoresTab() {}, renderRanking() {}, renderStats() {}, renderAdmin() {}
  });
  vm.runInContext(read('js/navigation.js'), context, { filename: 'navigation.js' });

  let prevented = false;
  context.handleTabKeydown({ key: 'ArrowRight', currentTarget: tabs[0], preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(tabs[1].attrs['aria-selected'], 'true');
  assert.equal(tabs[1].tabIndex, 0);
  assert.equal(tabs[1].focused, true);
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[1].hidden, false);

  context.renderClubIdentity();
  assert.equal(nodes.get('roster-club-kicker').textContent, 'CLUB ATLÉTICO PRUEBA · MIÉRCOLES 21:30');
  assert.match(context.profileRowAttributes({ id: 'p-1', name: 'Jugador Uno' }), /role="button" tabindex="0"[^>]*aria-label="Ver ficha de Jugador Uno"/);
}

async function attendanceFailsClosedAndCanRetry() {
  const nodes = new Map([
    ['attend-list', { innerHTML: '' }],
    ['attendance-clear-all', { hidden: false }],
    ['stat-going', { textContent: '' }],
    ['stat-notgoing', { textContent: '' }],
    ['stat-pending', { textContent: '' }]
  ]);
  const toasts = [];
  let rpcCalls = 0;
  let refreshCalls = 0;
  const context = vm.createContext({
    console,
    state: { currentClub: { id: 'club-a' }, currentUser: { id: 'me', isAdmin: false }, players: [] },
    document: { getElementById: id => nodes.get(id) || null },
    canRunClubBulkActions: () => false,
    getEffectivePosition: () => 'MED',
    posEmoji: () => '⚙️',
    POS_LABELS: { MED: 'Mediocampo' },
    escapeHtml: value => String(value ?? ''),
    showToast: message => toasts.push(message),
    callRpc: async () => { rpcCalls++; },
    renderHub() {},
    refreshPlayers: async () => { refreshCalls++; },
    confirmAppAction: async () => true
  });
  vm.runInContext(read('js/tabs/asistencia.js'), context, { filename: 'asistencia.js' });

  context.renderAttendance();
  assert.equal(nodes.get('stat-going').textContent, '—');
  assert.equal(nodes.get('attendance-clear-all').hidden, true);
  assert.match(nodes.get('attend-list').innerHTML, /No pudimos cargar el plantel/);
  assert.match(nodes.get('attend-list').innerHTML, /retryAttendancePlayers/);
  assert.doesNotMatch(nodes.get('attend-list').innerHTML, /setAttendance\(/);

  await context.setAttendance('', 'going');
  assert.equal(rpcCalls, 0, 'sin plantel nunca debe salir una escritura vacía');
  assert.match(toasts.at(-1), /plantel no está disponible/i);

  await context.retryAttendancePlayers(null);
  assert.equal(refreshCalls, 1);

  context.state.players = [{ id: 'me', name: 'Yo', attendance: 'going' }];
  context.renderAttendance();
  assert.match(nodes.get('attend-list').innerHTML, /type="button"[^>]+aria-pressed="true"/);
  assert.match(nodes.get('attend-list').innerHTML, /setAttendance\('me','going'\)/);
}

(async () => {
  staticSemanticsAreComplete();
  navigationSupportsArrowKeysAndDynamicClubText();
  await attendanceFailsClosedAndCanRetry();
  console.log('PASS ui-resilience-accessibility');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
