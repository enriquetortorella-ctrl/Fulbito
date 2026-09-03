const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, matches: [] });
for (const file of ['js/state.js', 'js/ratings-normalize.js', 'js/stats-core.js', 'js/tabs/jugadores.js', 'js/tabs/equipos.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const state = vm.runInContext('state', context);
const fieldStats = Array.from(vm.runInContext('FIELD_STATS', context));
const positions = ['POR', 'DEF', 'MED', 'DEL'];
const rating = { ritmo: 1, tiro: 5, pase: 3, defensa: 4, fisico: 2, ataque: 5 };
const mean = Object.values(rating).reduce((sum, value) => sum + value, 0) / 6;
const toOvr = value => Math.round(50 + (value - 1) / 4 * 49);

// Una posición inferida tampoco puede entrar indirectamente en la fórmula.
context.getEffectivePosition = () => { throw new Error('El OVR no debe consultar la posición'); };
for (const votes of [1, 3, 5]) {
  const player = { id: 'p1', name: 'Prueba', ratingMode: 'field', ratings: {} };
  for (let index = 0; index < votes; index++) player.ratings[`v${index}`] = { ...rating };
  state.players = [player];
  const expected = toOvr((mean * votes + 3 * 3) / (votes + 3));
  const before = JSON.stringify(player.ratings);
  for (const primary of positions) {
    for (const secondary of [...positions, null]) {
      player.posPrimary = primary;
      player.posSecondary = secondary;
      assert.equal(context.getOverall(player), expected, `${votes} votos, ${primary}/${secondary}: mismo OVR`);
      assert.equal(context.rankingPlayerOverall(player), expected, 'los rankings usan la fórmula compartida');
      assert.equal(context.getTeamPlayerRatedOvr(player), expected, 'los nuevos equipos usan el mismo OVR');
      assert.equal(context.rosterEntries()[0].ovr, expected, 'el plantel usa el mismo OVR');
    }
  }
  assert.equal(JSON.stringify(player.ratings), before, 'el recálculo no cambia los votos guardados');
  player.ratings[player.id] = Object.fromEntries(fieldStats.map(stat => [stat, 1]));
  player.ratings.partial = { ritmo: 5 };
  assert.equal(context.getOverall(player), expected, 'autovotos y boletas parciales siguen excluidos');
  player.ratings[player.id] = { ...rating };
  for (const pos of positions) {
    player.posPrimary = pos;
    assert.equal(context.getSelfOverall(player), toOvr(mean), 'la versión propia tampoco depende de la posición');
  }
}

// Todos los atributos de campo aportan exactamente lo mismo, incluido ATA.
for (const improvedStat of fieldStats) {
  const attributes = Object.fromEntries(fieldStats.map(stat => [stat, stat === improvedStat ? 4 : 2]));
  assert.equal(context.getOverallAttributeScore({ ratingMode: 'field' }, attributes), 14 / 6);
}
assert.equal(context.getOverallAttributeScore({}, { ...rating, ataque: undefined, atajadas: 5 }), mean,
  'Ataque conserva la compatibilidad con su clave histórica');

// El modo arquero explícito sigue separado de la posición declarada de campo.
const keeperRating = { estirada: 2, manos: 3, saque: 4, reflejos: 5, posicion: 4, uno_contra_uno: 2 };
const keeper = { id: 'keeper', ratingMode: 'goalkeeper', posPrimary: 'POR', ratings: { voter: keeperRating } };
state.players = [keeper];
const keeperScore = 5 * 0.3 + 3 * 0.25 + 4 * 0.2 + 2 * 0.15 + 2 * 0.1;
const expectedKeeper = toOvr((keeperScore + 9) / 4);
assert.equal(context.getOverall(keeper), expectedKeeper);
keeper.posPrimary = 'DEF';
keeper.posSecondary = 'POR';
assert.equal(context.getOverall(keeper), expectedKeeper, 'arquero secundario conserva el modo elegido');
keeper.ratings[keeper.id] = { ...keeperRating };
assert.equal(context.getSelfOverall(keeper), toOvr(keeperScore));
assert.equal(context.getOverall({ id: 'unrated', ratings: {} }), null, 'no inventa OVR sin votos');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(index, /js\/ratings-normalize\.js\?v=61/);
assert.match(index, /js\/tabs\/jugadores\.js\?v=61/);
assert.match(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), /fulbito-shell-v61/);
console.log('PASS position-neutral-ovr');
