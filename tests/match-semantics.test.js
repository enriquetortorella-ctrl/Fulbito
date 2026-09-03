const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {
  state: { players: [] },
  matches: [],
  TEAM_NAMES: ['A', 'B', 'C'],
  console
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'stats-core.js'), 'utf8'),
  context,
  { filename: 'js/stats-core.js' }
);

function player(id) { return { id, name: id, isGuest: false }; }
function match(scores, winner = 'draw', goalsTracked = true) {
  const teams = scores.map((score, index) => ({
    name: context.TEAM_NAMES[index],
    players: [player(`p${index}`)]
  }));
  const goals = Object.fromEntries(scores.map((score, index) => [`p${index}`, score]));
  return { id: 'test', teams, result: { winner, margin: null, goals, goalsTracked } };
}

const partialTie = match([2, 2, 1]);
assert.deepEqual(Array.from(context.matchWinnerIndices(partialTie)), [0, 1]);
assert.equal(context.teamMatchOutcome(partialTie, 0), 'draw');
assert.equal(context.teamMatchOutcome(partialTie, 1), 'draw');
assert.equal(context.teamMatchOutcome(partialTie, 2), 'loss');
assert.equal(context.matchResultText(partialTie), 'Empate Equipos A y B');

context.matches = [partialTie];
assert.deepEqual(
  { ...context.getPlayerRecord('p0') },
  { w: 0, d: 1, l: 0, mvps: 0, goals: 2, goalPj: 1, assists: 0, assistPj: 0, pj: 1, pts: 1 }
);
assert.equal(context.getPlayerRecord('p2').l, 1, 'el tercero no debe recibir un punto por el empate de los líderes');

const zeroZero = match([0, 0]);
assert.equal(context.hasGoalsTracking(zeroZero), true);
assert.equal(context.matchHasGoals(zeroZero), false);
assert.equal(context.matchScoreStr(zeroZero), '0–0');
assert.deepEqual(Array.from(context.matchWinnerIndices(zeroZero)), [0, 1]);

const winner = match([3, 1], 0);
const derived = context.deriveScoreResult(winner);
assert.equal(derived.winner, 0);
assert.equal(derived.margin, 2);
assert.deepEqual(Array.from(derived.winners), [0]);

const manualDraw = match([0, 0, 0], 'draw', false);
assert.deepEqual(Array.from(context.matchWinnerIndices(manualDraw)), [0, 1, 2]);

// En un triangular con marcador, cada pareja se resuelve por sus propios
// goles: el segundo le ganó al tercero aunque ambos hayan perdido la general.
const threeTeamScore = match([3, 2, 1], 0);
const scoredPairs = context.getPairStats([threeTeamScore]).against;
assert.equal(scoredPairs['p1|p2'].games, 1);
assert.equal(scoredPairs['p1|p2'].draws, 0);
assert.equal(scoredPairs['p1|p2'].wins.p1, 1);
assert.equal(scoredPairs['p1|p2'].wins.p2, undefined);

// Sin marcador sólo se conocen los cruces que incluyen al ganador. El duelo
// entre los otros dos no se transforma en un empate inventado.
const legacyThreeTeam = match([0, 0, 0], 0, false);
delete legacyThreeTeam.result.goals;
const legacyPairs = context.getPairStats([legacyThreeTeam]).against;
assert.equal(legacyPairs['p1|p2'], undefined);
assert.equal(legacyPairs['p0|p1'].games, 1);
assert.equal(legacyPairs['p0|p1'].draws, 0);
assert.equal(legacyPairs['p0|p1'].wins.p0, 1);

// Los rankings conservan a quienes ya no están en el plantel mediante los
// snapshots del partido, sin duplicar actuales ni convertir invitados en
// jugadores históricos.
const currentPlayer = { id: 'current', name: 'Nombre actual', ovr: 81, isGuest: false };
const zeroMatchesPlayer = { id: 'zero', name: 'Alta reciente', ovr: 70, isGuest: false };
context.state.players = [currentPlayer, zeroMatchesPlayer];
const historicalMatches = [
  {
    id: 'newer', match_date: '2026-09-01', created_at: '2026-09-01T22:00:00Z',
    teams: [{ players: [
      { id: 'current', name: 'Nombre viejo', ovr: 60 },
      { id: 'deleted', name: 'Histórico reciente', ovr: 78 },
      { id: 'missing-ovr', name: 'Histórico sin OVR', ovr: null },
      { id: 'guest-flag', name: 'Invitado marcado', ovr: 72, isGuest: true },
      { id: 'guest-prefix', name: 'Invitado por id', ovr: 72 }
    ] }],
    result: { winner: 0, goals: {}, goalsTracked: true }
  },
  {
    id: 'older', match_date: '2026-08-01', created_at: '2026-08-01T22:00:00Z',
    teams: [{ players: [{ id: 'deleted', name: 'Histórico viejo', ovr: 65 }] }],
    result: { winner: 0, goals: {}, goalsTracked: true }
  }
];
const pool = Array.from(context.statsPlayerPool(historicalMatches));
assert.deepEqual(pool.map(item => item.id), ['current', 'zero', 'deleted', 'missing-ovr']);
assert.equal(pool.find(item => item.id === 'current').name, 'Nombre actual');
assert.equal(pool.filter(item => item.id === 'current').length, 1);
assert.equal(pool.find(item => item.id === 'deleted').name, 'Histórico reciente');
assert.equal(pool.find(item => item.id === 'deleted').historicalOvr, 78);
assert.equal(pool.find(item => item.id === 'missing-ovr').historicalOvr, null);
assert.equal(context.rankingPlayerOverall(pool.find(item => item.id === 'missing-ovr')), null);
assert.equal(context.isCurrentRosterPlayer('deleted'), false);
assert.equal(context.isCurrentRosterPlayer('zero'), true);

console.log('PASS match-semantics');
