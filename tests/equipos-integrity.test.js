const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'tabs', 'equipos.js'), 'utf8');
const toasts = [];
let saves = 0;
const context = {
  state: { players: [], builtTeams: null, teamsEditMode: false, currentUser: { isAdmin: false } },
  getOverall: player => Number.isFinite(player.ovrValue) ? player.ovrValue : null,
  getEffectivePosition: player => player.effPos || 'MED',
  showToast: message => toasts.push(message),
  saveMatchFromTeams: async () => { saves++; return true; },
  document: { getElementById: () => null },
  console
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'js/tabs/equipos.js' });
vm.runInContext('renderBuiltTeams = () => {};', context);

function player(id, effPos = 'MED', ovr = 70) {
  return { id, name: `Jugador ${id}`, effPos, ovr, balanceOvr: ovr, isGuest: false };
}

function team(players) {
  return { players, total: players.reduce((sum, item) => sum + item.balanceOvr, 0) };
}

function validate(teams, options) {
  const result = context.validateBuiltTeams(teams, options);
  return { ...result, errors: Array.from(result.errors), warnings: Array.from(result.warnings) };
}

// El formato es un máximo, no una exigencia exacta: un grupo chico puede usar F11.
const smallF11 = validate([
  team([player('a1'), player('a2')]),
  team([player('b1'), player('b2')])
], { fieldSize: 11 });
assert.equal(smallF11.valid, true, 'F11 debe permitir jugar con menos de 11 por equipo');
assert.equal(smallF11.capacity, 11);

const overF5 = validate([
  team(Array.from({ length: 6 }, (_, i) => player(`a${i}`))),
  team(Array.from({ length: 6 }, (_, i) => player(`b${i}`)))
], { fieldSize: 5 });
assert.equal(overF5.valid, false);
assert.match(overF5.errors.join(' '), /supera el cupo de F5/i);

const duplicate = player('duplicado');
const duplicated = validate([
  team([duplicate, player('a')]),
  team([duplicate, player('b')])
], { fieldSize: 5 });
assert.equal(duplicated.valid, false);
assert.match(duplicated.errors.join(' '), /más de un equipo/i);

const empty = validate([team([]), team([player('b1'), player('b2')])], { fieldSize: 5 });
assert.equal(empty.valid, false);
assert.match(empty.errors.join(' '), /al menos 2/i);

const unbalanced = validate([
  team([player('a1'), player('a2')]),
  team([player('b1'), player('b2'), player('b3'), player('b4')])
], { fieldSize: 8 });
assert.equal(unbalanced.valid, false);
assert.match(unbalanced.errors.join(' '), /cantidades parejas/i);

// Si hay un POR por equipo disponible, el corrector debe distribuirlos y el
// balance posterior no puede volver a dejar un equipo sin arquero.
const goalkeeperTeams = [
  team([player('g1', 'POR', 85), player('g2', 'POR', 70), player('g3', 'POR', 55)]),
  team([player('b1', 'DEF', 84), player('b2', 'MED', 69), player('b3', 'DEL', 54)]),
  team([player('c1', 'DEF', 83), player('c2', 'MED', 68), player('c3', 'DEL', 53)])
];
assert.equal(context.ensureGoalkeeperCoverage(goalkeeperTeams), true);
assert.deepEqual(goalkeeperTeams.map(t => t.players.filter(context.isTeamGoalkeeper).length), [1, 1, 1]);
context.balancePositions(goalkeeperTeams);
assert.deepEqual(goalkeeperTeams.map(t => t.players.filter(context.isTeamGoalkeeper).length), [1, 1, 1]);
assert.equal(validate(goalkeeperTeams, { fieldSize: 5 }).valid, true);

// La edición no puede vaciar un equipo ni exceder el formato elegido.
vm.runInContext('fieldSelected = 5', context);
context.state.builtTeams = [team([player('solo')]), team([player('b1'), player('b2')])];
assert.equal(context.fulbitoMovePlayer(0, 0, 1), false);
assert.equal(context.state.builtTeams[0].players.length, 1);
assert.match(toasts.at(-1), /equipo vacío/i);

context.state.builtTeams = [
  team([player('a1'), player('a2')]),
  team(Array.from({ length: 5 }, (_, i) => player(`b${i}`)))
];
assert.equal(context.fulbitoMovePlayer(0, 0, 1), false);
assert.equal(context.state.builtTeams[1].players.length, 5);
assert.match(toasts.at(-1), /cupo de F5/i);

context.state.builtTeams = [
  team([player('a1'), player('a2')]),
  team([player('b1'), player('b2'), player('b3'), player('b4')])
];
context.state.teamsEditMode = true;
assert.equal(context.confirmTeamEdits(), false);
assert.equal(context.state.teamsEditMode, true, 'una edición inválida debe seguir abierta');

context.state.builtTeams = [
  team([player('a1'), player('a2')]),
  team([player('b1'), player('b2')])
];
context.saveValidatedMatchFromTeams().then(saved => {
  assert.equal(saved, true);
  assert.equal(saves, 1, 'el guardado válido debe delegar una sola vez');

  // El armado mismo también debe respetar la capacidad elegida.
  context.state.players = Array.from({ length: 11 }, (_, i) => ({
    ...player(`p${i}`, 'MED', 60 + i),
    attendance: 'going'
  }));
  context.state.builtTeams = null;
  vm.runInContext('numTeamsSelected = 2; fieldSelected = 5', context);
  context.buildTeams();
  assert.equal(context.state.builtTeams, null, '11 jugadores no entran en dos equipos F5');
  assert.match(toasts.at(-1), /hasta 10 jugadores/i);

  vm.runInContext('fieldSelected = 11', context);
  context.buildTeams();
  assert.deepEqual(Array.from(context.state.builtTeams, t => t.players.length).sort((a,b) => a-b), [5, 6]);
  assert.equal(validate(context.state.builtTeams, { fieldSize: 11 }).valid, true);
  console.log('PASS equipos-integrity');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
