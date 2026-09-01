// STATE
// ============================================================
let state = {
  currentUser: null,
  currentClub: null,
  clubs: [],
  players: [],
  platformClubs: [],
  supportMode: false,
  supportHome: null,
  numTeams: 2,
  fieldType: 5,
  builtTeams: null
};
let rosterQuery = '';
let rosterSort = 'rating';

const POSITIONS = ['POR','DEF','MED','DEL'];
const POS_LABELS = { POR:'Portero', DEF:'Defensa', MED:'Mediocampo', DEL:'Delantero' };
const POS_STAT = { POR:'ataque', DEF:'defensa', MED:'pase', DEL:'tiro' };
const FIELD_STATS = ['ritmo','tiro','pase','defensa','fisico','ataque'];
const GOALKEEPER_STATS = ['estirada','manos','saque','reflejos','posicion','uno_contra_uno'];
// STATS se conserva para el armado de equipos, que usa jugadores de campo.
const STATS = FIELD_STATS;
const STAT_LABELS = {
  ritmo:'RIT', tiro:'TIR', pase:'PAS', defensa:'DEF', fisico:'FIS', ataque:'ATA',
  estirada:'EST', manos:'MAN', saque:'SAQ', reflejos:'REF', posicion:'POS', uno_contra_uno:'1V1'
};

// ATA siempre significa Ataque. Las calificaciones que ya existían en la
// base se guardaron con la clave heredada "atajadas"; se interpretan como
// Ataque para que ningún voto histórico se pierda durante la transición.
function getStatValue(values, stat) {
  const raw = values?.[stat] ?? (stat === 'ataque' ? values?.atajadas : 0);
  return Number(raw) || 0;
}

function usesGoalkeeperStats(player) {
  return player?.ratingMode === 'goalkeeper' && (player.posPrimary === 'POR' || player.posSecondary === 'POR');
}

function getRatingStats(player) {
  return usesGoalkeeperStats(player) ? GOALKEEPER_STATS : FIELD_STATS;
}
const TEAM_NAMES = ['A','B','C'];
const TEAM_EMOJIS = ['🔵','🔴','🟣'];
const TEAM_CLASSES = ['team-a','team-b','team-c'];

const CARD_TIERS = [
  { min:80, cls:'rare',   label:'Icon' },
  { min:72, cls:'gold',   label:'Gold' },
  { min:65, cls:'silver', label:'Silver' },
  { min:0,  cls:'bronze', label:'Bronze' },
];

// ============================================================
