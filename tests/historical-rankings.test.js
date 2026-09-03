const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const current = { id: 'current', name: 'Nombre actual', username: 'actual', ovr: 81 };
const zero = { id: 'zero', name: 'Alta reciente', username: 'alta', ovr: 70 };

const played = (id, date, players, goals) => ({
  id,
  match_date: date,
  created_at: `${date}T22:00:00Z`,
  teams: [{ name: 'A', players }],
  result: { winner: 0, margin: 1, goals, goalsTracked: true }
});

const scope = [
  played('newer', '2026-09-01', [
    { id: 'current', name: 'Nombre viejo', ovr: 60 },
    { id: 'deleted', name: 'Histórico reciente', ovr: 78 },
    { id: 'missing-ovr', name: 'Histórico sin OVR', ovr: null },
    { id: 'flagged-outsider', name: 'Invitado marcado', ovr: 72, isGuest: true },
    { id: 'guest-prefix', name: 'Invitado por id', ovr: 72 }
  ], {
    current: 1,
    deleted: 2,
    'flagged-outsider': 4,
    'guest-prefix': 3,
    __t0: 2
  }),
  played('older', '2026-08-01', [
    { id: 'current', name: 'Nombre todavía más viejo', ovr: 55 },
    { id: 'deleted', name: 'Histórico viejo', ovr: 65 }
  ], {}),
  {
    id: 'pending',
    match_date: '2026-09-02',
    created_at: '2026-09-02T22:00:00Z',
    teams: [{ name: 'A', players: [{ id: 'pending-history', name: 'Histórico sin PJ', ovr: 69 }] }],
    result: { winner: null, goals: {}, goalsTracked: true }
  }
];

const context = {
  state: { players: [current, zero] },
  matches: scope,
  TEAM_NAMES: ['A', 'B', 'C'],
  console,
  getOverall: player => player?.ovr ?? null,
  escapeHtml: value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;'),
  safePhotoUrl: () => '',
  formatMatchDate: match => match.match_date,
  getAvgStats: () => ({}),
  getCardHighlights: () => ({ topScorerIds: new Set(), latestMvpId: null, forms: new Map() })
};

vm.createContext(context);
for (const relative of ['js/stats-core.js', 'js/tabs/stats.js']) {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'),
    context,
    { filename: relative }
  );
}

const pool = Array.from(context.statsPlayerPool(scope));
const ids = pool.map(player => player.id);

// El plantel actual gana sobre cualquier snapshot y no se duplica.
assert.equal(ids.filter(id => id === 'current').length, 1, 'el jugador actual no debe duplicarse');
assert.equal(pool.find(player => player.id === 'current').name, 'Nombre actual');

// Para un exjugador se toma la foto más nueva del período.
assert.equal(pool.find(player => player.id === 'deleted').name, 'Histórico reciente');
assert.equal(pool.find(player => player.id === 'deleted').historicalOvr, 78);

// Un OVR desconocido sigue siendo desconocido: nunca se transforma en cero.
const missingOvr = pool.find(player => player.id === 'missing-ovr');
assert.equal(missingOvr.historicalOvr, null);
assert.equal(context.rankingPlayerOverall(missingOvr), null);

// Ninguna de las dos representaciones históricas de invitados entra al pool.
assert.equal(ids.includes('flagged-outsider'), false);
assert.equal(ids.includes('guest-prefix'), false);

const ranked = Array.from(context.statsPlayers(scope));
const rankedWithZero = Array.from(context.statsPlayers(scope, { includeZero: true }));

// Los exjugadores con partidos sí permanecen; includeZero agrega únicamente
// altas actuales y no convierte snapshots pendientes en falsos participantes.
assert.equal(ranked.some(row => row.p.id === 'deleted' && row.pj === 2), true);
assert.equal(ranked.some(row => row.p.id === 'zero'), false);
assert.equal(rankedWithZero.some(row => row.p.id === 'zero' && row.pj === 0), true);
assert.equal(rankedWithZero.some(row => row.p.id === 'pending-history'), false);

// Los goles externos se conservan en el total, pero no inflan el ranking.
const playedScope = scope.filter(context.isPlayed);
const playedRows = Array.from(context.statsPlayers(playedScope));
const rankedGoals = playedRows.reduce((sum, row) => sum + row.goals, 0);
const allGoals = playedScope.reduce((sum, match) => sum + context.matchTotalGoals(match), 0);
assert.equal(rankedGoals, 3);
assert.equal(allGoals, 12);
assert.equal(allGoals - rankedGoals, 9, 'invitados y goles sin autor se concilian aparte');
assert.match(context.goleadoresHTML(playedScope, playedRows), /9 de invitados o sin autor se informan aparte/);

// Una fila histórica se muestra, pero no ofrece navegación a una ficha borrada.
const performance = context.rendimientoHTML(playedScope, playedRows);
const historicalRow = performance.match(/<tr class="is-historical">\s*<td>Histórico reciente<\/td>[\s\S]*?<\/tr>/);
assert.ok(historicalRow, 'la fila histórica debe ser visible');
assert.doesNotMatch(historicalRow[0], /onclick=|tabindex=|role="button"/);

console.log('PASS historical-rankings');
