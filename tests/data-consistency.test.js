const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadScript(relativePath, context) {
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), context, { filename: relativePath });
  return context;
}

async function testMatchLoadContract() {
  let response = [];
  const context = loadScript('js/storage.js', {
    state: { currentClub: { id: 'club-test' } },
    callRpc: async () => {
      if (response instanceof Error) throw response;
      return response;
    },
    console: { error() {} }
  });

  assert.deepEqual(Array.from(await context.loadMatches()), [], 'una respuesta vacía válida debe seguir siendo []');
  response = new Error('sin red');
  assert.equal(await context.loadMatches(), null, 'un error debe distinguirse con null');
  response = { unexpected: true };
  assert.equal(await context.loadMatches(), null, 'una respuesta inválida no debe fingir cero partidos');
  assert.equal(await context.loadMatches(''), null, 'sin club no existe una lectura válida');
}

async function testRatingCompletenessAndWriteOrder() {
  const serverRating = {};
  let activeWrites = 0;
  let maxActiveWrites = 0;
  const player = { id: 'target', name: 'Compañero', ratings: {} };
  const noopElement = { innerHTML: '', previousElementSibling: null };
  const context = loadScript('js/tabs/calificar.js', {
    state: {
      currentClub: { id: 'club-test' },
      currentUser: { id: 'voter' },
      players: [player]
    },
    getRatingStats: () => ['ritmo', 'tiro'],
    getStatValue: (rating, stat) => Number(rating?.[stat]) || 0,
    mapPlayers: rows => rows,
    callRpc: async (_name, params) => {
      activeWrites++;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      await new Promise(resolve => setTimeout(resolve, params.p_value === 1 ? 20 : 0));
      serverRating[params.p_stat] = params.p_value;
      activeWrites--;
      return { id: 'target', name: 'Compañero', ratings: { voter: { ...serverRating } } };
    },
    document: {
      getElementById: () => noopElement,
      querySelector: () => null,
      createElement: () => ({})
    },
    showToast() {},
    escapeHtml: String,
    posEmoji: () => '',
    getEffectivePosition: () => 'MED',
    STAT_LABELS: { ritmo: 'RIT', tiro: 'TIR' },
    FIELD_STATS: [],
    GOALKEEPER_STATS: [],
    matches: [],
    URL,
    Blob,
    navigator: {},
    console
  });

  assert.equal(context.hasCompleteRating(player, 'voter'), false, 'sin voto completo no debe decir Votado');
  player.ratings.voter = { ritmo: 3 };
  assert.equal(context.hasCompleteRating(player, 'voter'), false, 'un voto parcial no debe decir Votado');
  player.ratings = {};

  await Promise.all([
    context.rateStat('target', 'ritmo', 1),
    context.rateStat('target', 'ritmo', 5)
  ]);

  assert.equal(maxActiveWrites, 1, 'las escrituras del mismo jugador deben serializarse');
  assert.equal(player.ratings.voter.ritmo, 5, 'el último toque debe quedar tanto en servidor como en estado local');
  assert.equal(vm.runInContext('_ratingWritesPending', context), 0, 'la protección del auto-sync debe liberarse al terminar');
  assert.equal(vm.runInContext('_ratingWriteGeneration', context), 2, 'cada toque debe invalidar lecturas anteriores del auto-sync');
  player.ratings.voter.tiro = 4;
  assert.equal(context.hasCompleteRating(player, 'voter'), true, 'recién todos los atributos aplicables completan el voto');
}

function testTeamNeutralScoreIsNotDisplayedAsOvr() {
  const context = loadScript('js/tabs/equipos.js', {
    state: {},
    getOverall: player => player.computedOvr ?? null,
    console
  });
  const unrated = { id: 'u', ovr: null, computedOvr: null, isGuest: false };
  const rated = { id: 'r', ovr: null, computedOvr: 74, isGuest: false };
  const guest = { id: 'g', ovr: null, balanceOvr: 60, isGuest: true };

  assert.equal(context.getTeamPlayerRatedOvr(unrated), null);
  assert.equal(context.getTeamPlayerBalanceScore(unrated), 60);
  assert.equal(context.getTeamPlayerRatedOvr(rated), 74);
  assert.equal(context.getTeamPlayerBalanceScore(rated), 74);
  assert.equal(context.getTeamPlayerRatedOvr(guest), null);
  assert.equal(context.getTeamPlayerBalanceScore(guest), 60);
  assert.equal(context.getTeamRatedAverage([unrated, rated, guest]), 74, 'el promedio visible excluye neutrales internos');
}

(async () => {
  await testMatchLoadContract();
  await testRatingCompletenessAndWriteOrder();
  testTeamNeutralScoreIsNotDisplayedAsOvr();
  console.log('PASS data-consistency');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
