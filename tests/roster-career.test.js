const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const player = { id: 'p1', name: 'Jugador <Prueba> & Compañía', username: 'Prueba' };
const highlights = { topScorerIds: new Set(['p1']), latestMvpId: 'p1', forms: new Map() };
const context = vm.createContext({
  state: { players: [player] },
  escapeHtml: value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  getOverall: () => 74,
  getCardTier: () => ({ cls: 'gold', label: 'ORO' }),
  getEffectivePosition: () => 'MED',
  getAvgStats: () => ({}),
  safePhotoUrl: () => '',
  getRatingStats: () => ['ritmo', 'tiro', 'pase', 'defensa', 'fisico', 'ataque'],
  getStatValue: () => 3,
  STAT_LABELS: { ritmo: 'RIT', tiro: 'TIR', pase: 'PAS', defensa: 'DEF', fisico: 'FIS', ataque: 'ATA' },
  statToFifa: () => 75,
  getPlayerRecord: () => { throw new Error('Debe reutilizar el historial calculado por el plantel'); }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/tabs/jugadores.js'), 'utf8'), context);

const rec = { pj: 9, w: 6, d: 1, l: 2, mvps: 2, goals: 26, goalPj: 5, assists: 3, assistPj: 2 };
const before = JSON.stringify(rec);
const html = context.renderRosterPlayerCard(player, highlights, rec);
assert.equal(JSON.stringify(rec), before, 'renderizar no debe modificar los valores de origen');
assert.match(html, /ÚLTIMO MVP/, 'el reconocimiento actual se distingue del total acumulado');
assert.match(html, /Jugador &lt;Prueba&gt; &amp; Compañía/);
assert.doesNotMatch(html, /Jugador <Prueba>/, 'el nombre no se interpreta como HTML');
assert.match(html, /aria-label="Ver estadísticas de Jugador &lt;Prueba&gt; &amp; Compañía" onclick="openPlayerProfile\('p1'\)"/);
assert.equal((html.match(/data-career-metric=/g) || []).length, 3);
assert.equal((html.match(/class="fifa-card-stat(?: |")/g) || []).length, 6);
assert.doesNotMatch(html, /class="fifa-meta"/, 'no duplicar los totales dentro del escudo del plantel');

const metric = (markup, key) => markup.match(new RegExp(`data-career-metric="${key}"[\\s\\S]*?<strong>([^<]+)</strong><span>([^<]+)</span><small>([^<]+)</small>`)).slice(1);
assert.deepEqual(metric(html, 'mvp'), ['2', 'MVP', 'premios']);
assert.deepEqual(metric(html, 'goals'), ['26', 'GOLES', '5 PJ']);
assert.deepEqual(metric(html, 'assists'), ['3', 'ASIST.', '2 PJ']);
assert.match(html, /aria-label="6 victorias, 1 empates, 2 derrotas"/);

const missing = context.renderRosterPlayerCard(player, highlights, { ...rec, pj: 0, w: 0, d: 0, l: 0, mvps: 0, goals: 0, goalPj: 0, assists: 0, assistPj: 0 });
assert.deepEqual(metric(missing, 'goals'), ['—', 'GOLES', 'Sin registro']);
assert.deepEqual(metric(missing, 'assists'), ['—', 'ASIST.', 'Sin registro']);
const zero = context.renderRosterPlayerCard(player, highlights, { ...rec, goals: 0, assists: 0 });
assert.deepEqual(metric(zero, 'goals'), ['0', 'GOLES', '5 PJ']);
assert.deepEqual(metric(zero, 'assists'), ['0', 'ASIST.', '2 PJ']);

// Un total grande o una cobertura diferente no se recorta ni se sustituye por PJ.
const many = context.renderRosterPlayerCard(player, highlights, { ...rec, goals: 126, goalPj: 45, assists: 103, assistPj: 41 });
assert.deepEqual(metric(many, 'goals'), ['126', 'GOLES', '45 PJ']);
assert.deepEqual(metric(many, 'assists'), ['103', 'ASIST.', '41 PJ']);
for (const variant of ['podium', 'thumbnail', undefined]) {
  const compact = context.renderFifaCard(player, highlights, variant, rec);
  assert.match(compact, /class="fifa-meta"/, 'conservar los datos en otras vistas');
  assert.match(compact, /class="fifa-medal is-mvp"[^>]*><i>★<\/i><b>2<\/b>/);
  assert.match(compact, /class="fifa-medal is-goal"[^>]*><i>⚽<\/i><b>26<\/b>/);
  assert.match(compact, /class="fifa-medal is-assist"[^>]*><i>🎯<\/i><b>3<\/b>/);
}
console.log('PASS roster-career');
