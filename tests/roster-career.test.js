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
assert.match(html, /role="button" tabindex="0" aria-label="Ver ficha de Jugador &lt;Prueba&gt; &amp; Compañía"/);
assert.match(html, /onclick="event.stopPropagation\(\);openPlayerProfile\('p1'\)"/);
assert.match(html, /onkeydown="if\(event.key==='Enter'\|\|event.key===' '\)/, 'la ficha conserva navegación por teclado');
assert.equal((html.match(/data-career-metric=/g) || []).length, 3);
assert.equal((html.match(/class="fifa-card-stat(?: |")/g) || []).length, 6);
assert.doesNotMatch(html, /class="player-card-tile|class="player-career/, 'el diseño es una tarjeta integrada, sin panel externo');
assert.equal((html.match(/class="fifa-meta"/g) || []).length, 1);
assert.match(html, /class="fifa-top">[\s\S]*?class="fifa-card-medals">/, 'las tres métricas pertenecen al bloque de OVR');
assert.match(html, /class="fifa-card-name[^>]*><strong>PRUEBA<\/strong><small>Jugador &lt;Prueba&gt; &amp; Compañía<\/small>/, 'apodo y nombre real se conservan');

const metric = (markup, key) => markup.match(new RegExp(`data-career-metric="${key}"[^>]*><i[^>]*>[^<]*</i><b>([^<]+)</b><em>([^<]+)</em>`)).slice(1);
assert.deepEqual(metric(html, 'mvp'), ['2', 'MVP']);
assert.deepEqual(metric(html, 'goal'), ['26', 'GOLES']);
assert.deepEqual(metric(html, 'assist'), ['3', 'ASIST.']);
assert.match(html, /title="26 goles en 5 partidos con planilla"/);
assert.match(html, /title="3 asistencias en 2 partidos con registro completo"/);
assert.match(html, /class="fifa-card-appearances"[^>]*><b>9<\/b> PJ/);
assert.match(html, /aria-label="6 victorias, 1 empates, 2 derrotas"/);
assert.match(html, />6V · 1E · 2D<\/div>/);

const missing = context.renderRosterPlayerCard(player, highlights, { ...rec, pj: 0, w: 0, d: 0, l: 0, mvps: 0, goals: 0, goalPj: 0, assists: 0, assistPj: 0 });
assert.deepEqual(metric(missing, 'mvp'), ['0', 'MVP']);
assert.deepEqual(metric(missing, 'goal'), ['—', 'GOLES']);
assert.deepEqual(metric(missing, 'assist'), ['—', 'ASIST.']);
assert.match(missing, /is-goal is-unrecorded/);
assert.match(missing, /is-assist is-unrecorded/);
assert.match(missing, /title="Goles: sin registro"/);
assert.match(missing, /title="Asistencias: sin registro"/);
const zero = context.renderRosterPlayerCard(player, highlights, { ...rec, goals: 0, assists: 0 });
assert.deepEqual(metric(zero, 'goal'), ['0', 'GOLES']);
assert.deepEqual(metric(zero, 'assist'), ['0', 'ASIST.']);
assert.doesNotMatch(zero, /is-unrecorded/);

// Un total grande o una cobertura diferente no se recorta ni se sustituye por PJ.
const many = context.renderRosterPlayerCard(player, highlights, { ...rec, goals: 9999, goalPj: 145, assists: 1103, assistPj: 141 });
assert.deepEqual(metric(many, 'goal'), ['9999', 'GOLES']);
assert.deepEqual(metric(many, 'assist'), ['1103', 'ASIST.']);
assert.match(many, /9999 goles en 145 partidos con planilla/);
assert.match(many, /1103 asistencias en 141 partidos con registro completo/);
for (const variant of ['podium', 'thumbnail', undefined]) {
  const compact = context.renderFifaCard(player, highlights, variant, rec);
  assert.match(compact, /class="fifa-meta"/, 'conservar los datos en otras vistas');
  for (const key of ['mvp', 'goal', 'assist']) assert.deepEqual(metric(compact, key), metric(html, key));
  assert.match(compact, /class="fifa-card-appearances"[^>]*><b>9<\/b> PJ/);
  assert.match(compact, />6V · 1E · 2D<\/div>/);
}
const thumbnail = context.renderFifaCard(player, highlights, 'thumbnail', rec, false);
assert.match(thumbnail, /card-thumbnail/);
assert.match(thumbnail, /aria-hidden="true"/);
assert.doesNotMatch(thumbnail, /role="button"|tabindex=|onclick=|onkeydown=/, 'la fila padre es el único control de la miniatura');
const historical = context.renderFifaCard({ ...player, id: 'deleted' }, highlights, 'podium', rec);
assert.match(historical, /is-historical/);
assert.doesNotMatch(historical, /role="button"|tabindex=|onclick=|onkeydown=/, 'un histórico no ofrece una ficha inexistente');
console.log('PASS roster-career');
