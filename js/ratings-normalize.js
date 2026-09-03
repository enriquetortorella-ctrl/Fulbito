// NORMALIZACIÓN DE VOTOS POR SESGO DEL VOTANTE
// ============================================================
let _biasCache = null;
let _biasCacheStamp = 0;

function isCompleteStoredRating(player, rating) {
  return !!rating && getRatingStats(player).every(stat => getStatValue(rating, stat) > 0);
}

function computeVoterBiases() {
  // El sesgo depende de los valores, no sólo de la cantidad de votos. Si una
  // persona corrige una estrella ya registrada, el objeto conserva la misma
  // cantidad de claves y la caché anterior quedaba desactualizada.
  const stamp = JSON.stringify(state.players.map(p => [p.id, p.ratings || {}]));
  if (_biasCache && _biasCacheStamp === stamp) return _biasCache;

  const allVotes = [];
  state.players.forEach(p => {
    Object.entries(p.ratings || {}).forEach(([voterId, r]) => {
      if (voterId === p.id) return;
      if (!isCompleteStoredRating(p, r)) return;
      getRatingStats(p).forEach(s => {
        const value = getStatValue(r, s);
        if (value > 0) allVotes.push(value);
      });
    });
  });
  const globalAvg = allVotes.length ? allVotes.reduce((a,b)=>a+b,0) / allVotes.length : 3;

  const voterVotes = {};
  state.players.forEach(p => {
    Object.entries(p.ratings || {}).forEach(([voterId, r]) => {
      if (voterId === p.id) return;
      if (!isCompleteStoredRating(p, r)) return;
      if (!voterVotes[voterId]) voterVotes[voterId] = [];
      getRatingStats(p).forEach(s => {
        const value = getStatValue(r, s);
        if (value > 0) voterVotes[voterId].push(value);
      });
    });
  });

  const biases = {};
  Object.entries(voterVotes).forEach(([voterId, vals]) => {
    if (vals.length >= 10) {
      const voterAvg = vals.reduce((a,b)=>a+b,0) / vals.length;
      biases[voterId] = voterAvg - globalAvg;
    } else {
      biases[voterId] = 0;
    }
  });

  _biasCache = { biases, globalAvg };
  _biasCacheStamp = stamp;
  return _biasCache;
}

function normalizeVote(rawVote, voterId) {
  const { biases } = computeVoterBiases();
  const bias = biases[voterId] || 0;
  const adjusted = rawVote - bias;
  return Math.max(1, Math.min(5, adjusted));
}

function getValidRatings(player) {
  const myId = player.id;
  return Object.entries(player.ratings || {})
    // La interfaz guarda una estrella por vez. Una boleta interrumpida no debe
    // diluir atributos ausentes ni mover el OVR hasta completar la ficha.
    .filter(([voterId, rating]) => voterId !== myId && isCompleteStoredRating(player, rating))
    .map(([voterId, rating]) => {
      const normalized = {};
      getRatingStats(player).forEach(s => {
        const value = getStatValue(rating, s);
        if (value > 0) normalized[s] = normalizeVote(value, voterId);
      });
      return normalized;
    });
}

function getStatAverage(ratings, stat) {
  const vals = ratings.map(r => r[stat]||0).filter(v => v > 0);
  if (!vals.length) return 0;
  if (vals.length >= 4) {
    vals.sort((a,b) => a-b);
    const trimmed = vals.slice(1, -1);
    return trimmed.reduce((a,b)=>a+b,0) / trimmed.length;
  }
  return vals.reduce((a,b)=>a+b,0) / vals.length;
}

function getOverallAttributeScore(player, averages) {
  // El modo arquero se elige expresamente y conserva su fórmula específica.
  // La posición de campo (declarada o inferida) nunca cambia el peso del voto.
  if (usesGoalkeeperStats(player)) {
    return averages.reflejos*0.3 + averages.manos*0.25 + averages.posicion*0.2
      + averages.estirada*0.15 + averages.uno_contra_uno*0.1;
  }
  return FIELD_STATS.reduce((sum, stat) => sum + getStatValue(averages, stat), 0) / FIELD_STATS.length;
}

function getOverall(player) {
  const allRatings = getValidRatings(player);
  if (!allRatings.length) return null;

  const avg = {};
  getRatingStats(player).forEach(s => { avg[s] = getStatAverage(allRatings, s); });

  const ovr = getOverallAttributeScore(player, avg);

  const n = allRatings.length;
  const PRIOR = 3;
  const PRIOR_WEIGHT = 3;
  const smoothedOvr = (ovr * n + PRIOR * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT);

  return Math.round(50 + (smoothedOvr - 1) / 4 * 49);
}

function getEffectivePosition(player) {
  if (usesGoalkeeperStats(player)) return 'POR';
  const allRatings = getValidRatings(player);
  if (allRatings.length < 2) return player.posPrimary || 'MED';
  const avg = {};
  getRatingStats(player).forEach(s => { avg[s] = getStatAverage(allRatings, s); });
  const posScore = {
    POR: avg.ataque*0.6 + avg.fisico*0.4,
    DEF: avg.defensa*0.6 + avg.fisico*0.4,
    MED: avg.pase*0.6 + avg.ritmo*0.4,
    DEL: avg.tiro*0.6 + avg.ritmo*0.4,
  };
  const selfPos = player.posPrimary || 'MED';
  const selfScore = posScore[selfPos] || 0;
  const statBestPos = Object.entries(posScore).sort((a,b)=>b[1]-a[1])[0][0];
  const bestScore = posScore[statBestPos] || 0;
  if (statBestPos !== selfPos && bestScore - selfScore > 1.2 && allRatings.length >= 3) return statBestPos;
  return selfPos;
}

function getAvgStats(player) {
  const allRatings = getValidRatings(player);
  if (!allRatings.length) return null;
  const avg = {};
  getRatingStats(player).forEach(s => { avg[s] = Math.round(getStatAverage(allRatings, s) * 10) / 10; });
  return avg;
}

function statToFifa(val) {
  if (!val) return 40;
  return Math.round(40 + (val/5)*59);
}

function getCardTier(ovr) {
  return CARD_TIERS.find(t => ovr >= t.min) || CARD_TIERS[CARD_TIERS.length-1];
}

function showToast(msg, ms=2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), ms);
}

const genericModalReturnFocus = new Map();
const specializedModalIds = new Set(['modal-goal-assist', 'modal-crest-designer']);

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (!specializedModalIds.has(id)) genericModalReturnFocus.set(id, document.activeElement);
  modal.classList.add('open');
  if (!specializedModalIds.has(id)) requestAnimationFrame(() => modal.querySelector('.modal-close,button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')?.focus());
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  if (!specializedModalIds.has(id)) {
    const returnFocus = genericModalReturnFocus.get(id);
    genericModalReturnFocus.delete(id);
    if (returnFocus && document.contains(returnFocus) && typeof returnFocus.focus === 'function') returnFocus.focus();
  }
}

let appActionConfirmationResolver = null;

function confirmAppAction({ title = 'CONFIRMAR ACCIÓN', message, confirmText = 'Confirmar', danger = false }) {
  if (appActionConfirmationResolver) appActionConfirmationResolver(false);
  const modal = document.getElementById('modal-action-confirm');
  const heading = document.getElementById('modal-action-confirm-title');
  const copy = document.getElementById('modal-action-confirm-message');
  const confirmButton = document.getElementById('modal-action-confirm-button');
  heading.textContent = title;
  copy.textContent = message;
  confirmButton.textContent = confirmText;
  confirmButton.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  openModal('modal-action-confirm');
  return new Promise(resolve => { appActionConfirmationResolver = resolve; });
}

function resolveAppActionConfirmation(accepted) {
  const resolve = appActionConfirmationResolver;
  appActionConfirmationResolver = null;
  closeModal('modal-action-confirm');
  if (resolve) resolve(accepted);
}

function cancelAppActionConfirmation() { resolveAppActionConfirmation(false); }
function acceptAppActionConfirmation() { resolveAppActionConfirmation(true); }

// ============================================================
