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
const POS_STAT = { POR:'atajadas', DEF:'defensa', MED:'pase', DEL:'tiro' };
const STATS = ['ritmo','tiro','pase','defensa','fisico','atajadas'];
const STAT_LABELS = { ritmo:'RIT', tiro:'TIR', pase:'PAS', defensa:'DEF', fisico:'FIS', atajadas:'ATA' };
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
