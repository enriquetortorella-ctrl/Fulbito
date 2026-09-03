const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Datos sintéticos: los indicadores de las cartas deben corresponder con los
// de Stats, sin convertir partidos no registrados en ceros conocidos.
const player = id => ({ id, name: `Jugador ${id}`, username: id });
const roster = ['a', 'b', 'c', 'd', 'new'].map(player);
const teams = [
  { name: 'A', players: [player('a'), player('b')] },
  { name: 'B', players: [player('c'), player('d')] }
];
const fixture = (id, date, result, members = teams) => ({
  id, match_date: date, created_at: `${date}T23:00:00Z`, teams: members,
  result
});
const goal = (id, scorerId, assistType, assistPlayerId = null) => ({
  id, scorerId, assistType, assistPlayerId
});
const fixtures = [
  // Ganador y MVP históricos, sin planilla de goles ni asistencias.
  fixture('legacy', '2025-12-20', { winner: 0, margin: 1, mvp: 'a' }),
  // Un 0-0 registrado es información real: aumenta ambos denominadores.
  fixture('zero', '2026-01-10', {
    winner: 'draw', mvp: 'b', goals: {}, goalsTracked: true,
    goalEvents: [], assistsTracked: true
  }),
  // Sólo la jugada con asistente suma una asistencia. Individual/rebote no.
  fixture('complete', '2026-01-17', {
    winner: 0, margin: 1, mvp: 'a', goals: { a: '2', c: 1 }, goalsTracked: true,
    assistsTracked: true, goalEvents: [
      goal('g1', 'a', 'player', 'b'), goal('g2', 'a', 'individual'),
      goal('g3', 'c', 'rebound')
    ]
  }),
  // Planilla anterior a asistencias: goles sí, asistencias desconocidas.
  fixture('goals-only', '2026-01-24', {
    winner: 1, margin: 1, mvp: 'c', goals: { a: 1, c: 3 }, goalsTracked: true
  }),
  // Datos residuales de planilla no deben contar cuando se cerró sin marcador.
  fixture('no-score', '2026-01-31', {
    winner: 0, margin: 1, mvp: 'a', goals: { a: 99 }, goalsTracked: false,
    assistsTracked: false, goalEvents: [goal('stale', 'a', 'player', 'b')]
  }),
  // Registro parcial: cuenta el gol, pero no declara asistencias completas.
  fixture('partial', '2026-02-07', {
    winner: 0, margin: 1, mvp: null, goals: { a: 2 }, goalsTracked: true,
    assistsTracked: true, goalEvents: [goal('partial1', 'a', 'player', 'b')]
  }),
  // Un partido en vivo no altera MVP, historial ni totales oficiales.
  fixture('live', '2026-02-14', {
    winner: null, margin: null, mvp: 'a', goals: { a: 20 }, goalsTracked: true,
    assistsTracked: true, goalEvents: []
  }),
  // No alcanza con que un ID esté en result: debe haber participado.
  fixture('absent', '2026-02-21', {
    winner: 0, margin: 1, mvp: 'a', goals: { a: 100, c: 1 }, goalsTracked: true
  }, [{ players: [player('c')] }, { players: [player('d')] }])
];
const context = {
  state: { players: roster }, matches: fixtures, TEAM_NAMES: ['A', 'B', 'C'],
  getOverall: () => null, console
};
vm.createContext(context);
for (const relative of ['js/stats-core.js', 'js/tabs/stats.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), context, { filename: relative });
}

const a = { ...context.getPlayerRecord('a') };
assert.deepEqual(a, {
  w: 4, d: 1, l: 1, pj: 6, pts: 13, mvps: 3,
  goals: 5, goalPj: 4, assists: 0, assistPj: 2
});
const b = context.getPlayerRecord('b');
assert.equal(b.assists, 1, 'la asistencia del registro parcial no se mezcla con totales completos');
assert.equal(b.assistPj, 2, 'el promedio usa sólo 0-0 y partido con todos los eventos');
assert.equal(b.goals, 0);
assert.equal(b.goalPj, 4, 'cero goles es conocido porque sí hay planillas');
assert.equal(b.mvps, 1);

// — y 0 no son intercambiables: un alta sin partidos no tiene cobertura.
const newcomer = { ...context.getPlayerRecord('new') };
assert.deepEqual(newcomer, {
  w: 0, d: 0, l: 0, pj: 0, pts: 0, mvps: 0,
  goals: 0, goalPj: 0, assists: 0, assistPj: 0
});
const legacy = { ...context.getPlayerRecord('a', '2025') };
assert.equal(legacy.pj, 1);
assert.equal(legacy.mvps, 1);
assert.equal(legacy.goalPj, 0);
assert.equal(legacy.assistPj, 0);
const year = { ...context.getPlayerRecord('a', '2026') };
assert.equal(year.pj, 5);
assert.equal(year.mvps, 2);
assert.equal(year.goals, 5);

// El objeto usado por los podios/rankings filtrados debe dar los mismos
// valores que la carta general cuando se le entrega el mismo período.
const closed = fixtures.filter(context.isPlayed);
for (const p of roster) {
  const full = context.getPlayerRecord(p.id);
  const scoped = context.recordIn(closed, p.id);
  for (const field of Object.keys(full)) {
    assert.equal(scoped[field], full[field], `${p.id}: ${field} debe coincidir entre carta y Stats`);
  }
  assert.equal(full.pj, full.w + full.d + full.l, 'PJ debe conciliar con V/E/D');
  assert.equal(full.pts, full.w * 3 + full.d, 'los puntos no dependen de goles ni MVP');
  assert.ok(full.goalPj <= full.pj);
  assert.ok(full.assistPj <= full.goalPj);
  assert.ok(full.mvps <= full.pj);
}
const scoped2026 = closed.filter(m => m.match_date.startsWith('2026'));
const scopedYear = context.recordIn(scoped2026, 'a');
for (const field of Object.keys(year)) assert.equal(scopedYear[field], year[field]);

console.log('PASS player-card-metrics');
