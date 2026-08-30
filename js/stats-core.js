// GOLES — helpers (viven dentro de result.goals)
// ============================================================
// Un partido está JUGADO solo si tiene ganador definido.
// Así se pueden cargar goles en vivo sin cerrar el partido.
function isPlayed(m) {
  return !!(m && m.result && m.result.winner !== null && m.result.winner !== undefined);
}

function getGoals(m) { return (m && m.result && m.result.goals) || {}; }

// Desde que existe la planilla de goles, los partidos guardan esta marca dentro
// de result. Para los ya creados, la presencia de `goals` es compatible con la
// versión anterior de la planilla: incluye también los 0-0 registrados.
function hasGoalsTracking(m) {
  if (!m || !m.result) return false;
  if (Object.prototype.hasOwnProperty.call(m.result, 'goalsTracked')) return m.result.goalsTracked === true;
  return Object.prototype.hasOwnProperty.call(m.result, 'goals');
}

function goalTrackedMatches(ms) {
  return (ms || matches).filter(m => isPlayed(m) && hasGoalsTracking(m));
}

function teamGoals(m, ti) {
  const g = getGoals(m);
  let n = g['__t'+ti] || 0;
  (((m.teams||[])[ti]||{}).players||[]).forEach(p => { n += g[p.id]||0; });
  return n;
}

function matchTotalGoals(m) {
  return Object.values(getGoals(m)).reduce((a,b)=>a+(b||0),0);
}

function matchHasGoals(m) { return matchTotalGoals(m) > 0; }

function matchScore(m) {
  return (m.teams||[]).map((t,i) => teamGoals(m,i));
}

function matchScoreStr(m) { return matchScore(m).join('–'); }

// Goleadores de un partido, ordenados
function matchScorers(m) {
  const g = getGoals(m);
  return Object.entries(g)
    .filter(([k,v]) => !k.startsWith('__t') && v > 0)
    .map(([k,v]) => ({ id:k, name: matchPlayerName(m,k), goals:v }))
    .sort((a,b) => b.goals - a.goals || a.name.localeCompare(b.name));
}

function matchPlayerName(m, id) {
  for (const t of (m.teams||[])) {
    const f = (t.players||[]).find(p => p.id === id);
    if (f) return f.name;
  }
  return playerNameById(id);
}

// ============================================================
// RÉCORD / FORMA / MVP / GOLES POR JUGADOR (calculado desde matches)
// ============================================================
function getPlayerRecord(playerId, year) {
  let w=0, d=0, l=0, mvps=0, goals=0, goalPj=0;
  matches.forEach(m => {
    if (year && (m.match_date||'').slice(0,4) !== year) return;
    const teams = m.teams || [];
    const teamIdx = teams.findIndex(t => (t.players||[]).some(p => p.id === playerId));
    if (teamIdx === -1) return;
    if (isPlayed(m) && hasGoalsTracking(m)) {
      goals += getGoals(m)[playerId] || 0;
      goalPj++;
    }
    if (!isPlayed(m)) return;
    if (m.result.winner === 'draw') d++;
    else if (m.result.winner === teamIdx) w++;
    else l++;
    if (m.result.mvp === playerId) mvps++;
  });
  return { w, d, l, mvps, goals, goalPj, pj: w+d+l, pts: w*3 + d };
}

// Nombre de jugador por id (busca en plantel y, si fue borrado, en el historial)
function playerNameById(id) {
  const p = state.players.find(x => x.id === id);
  if (p) return p.name;
  for (const m of matches) {
    for (const t of (m.teams||[])) {
      const f = (t.players||[]).find(pp => pp.id === id);
      if (f) return f.name;
    }
  }
  return '¿?';
}

// Duplas (juntos) y rivalidades (enfrentados) — solo jugadores registrados
function getPairStats(ms) {
  const list = ms || matches;
  const together = {};
  const against = {};
  list.forEach(m => {
    if (!isPlayed(m)) return;
    const regTeams = (m.teams||[]).map(t => (t.players||[]).filter(p => !p.isGuest).map(p => p.id));

    // Juntos en el mismo equipo
    regTeams.forEach((ids, ti) => {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i+1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join('|');
          if (!together[key]) together[key] = { w:0, d:0, l:0 };
          if (m.result.winner === 'draw') together[key].d++;
          else if (m.result.winner === ti) together[key].w++;
          else together[key].l++;
        }
      }
    });

    // Enfrentados en equipos distintos
    for (let t1 = 0; t1 < regTeams.length; t1++) {
      for (let t2 = t1+1; t2 < regTeams.length; t2++) {
        regTeams[t1].forEach(a => regTeams[t2].forEach(b => {
          const key = [a, b].sort().join('|');
          if (!against[key]) against[key] = { games:0, draws:0, wins:{} };
          against[key].games++;
          if (m.result.winner === 'draw') against[key].draws++;
          else if (m.result.winner === t1) against[key].wins[a] = (against[key].wins[a]||0)+1;
          else if (m.result.winner === t2) against[key].wins[b] = (against[key].wins[b]||0)+1;
          // (con 3 equipos, si ganó el tercero no suma para ninguno de los dos)
        }));
      }
    }
  });
  return { together, against };
}

// Partidos del jugador en orden cronológico (viejo → nuevo)
function getPlayerMatchesChrono(playerId, ms) {
  return (ms || matches)
    .filter(m => isPlayed(m) && (m.teams||[]).some(t => (t.players||[]).some(p => p.id === playerId)))
    .slice()
    .sort((a,b) =>
      (a.match_date||'').localeCompare(b.match_date||'') ||
      (a.created_at||'').localeCompare(b.created_at||'')
    );
}

// Secuencia V/E/D del jugador
function getPlayerSeq(playerId, ms) {
  return getPlayerMatchesChrono(playerId, ms).map(m => {
    const ti = (m.teams||[]).findIndex(t => (t.players||[]).some(p => p.id === playerId));
    if (m.result.winner === 'draw') return 'E';
    return m.result.winner === ti ? 'V' : 'D';
  });
}

// Mejor racha ganadora histórica de un jugador
function getMaxWinStreak(playerId, ms) {
  return maxRun(getPlayerSeq(playerId, ms), x => x === 'V');
}
// Peor racha de derrotas
function getMaxLossStreak(playerId, ms) {
  return maxRun(getPlayerSeq(playerId, ms), x => x === 'D');
}
// Mayor cantidad de partidos seguidos sin perder
function getMaxUnbeatenStreak(playerId, ms) {
  return maxRun(getPlayerSeq(playerId, ms), x => x !== 'D');
}
function maxRun(seq, test) {
  let max = 0, cur = 0;
  seq.forEach(x => { cur = test(x) ? cur + 1 : 0; if (cur > max) max = cur; });
  return max;
}

// Goleadas ganadas por un jugador
function getRoutsWon(playerId, ms) {
  let n = 0;
  (ms || matches).forEach(m => {
    if (!isPlayed(m) || m.result.winner === 'draw' || m.result.margin !== 3) return;
    const ti = (m.teams||[]).findIndex(t => (t.players||[]).some(p => p.id === playerId));
    if (ti !== -1 && m.result.winner === ti) n++;
  });
  return n;
}

// Forma (últimos 5) + racha actual
function getPlayerForm(playerId, ms) {
  const seq = getPlayerSeq(playerId, ms);
  const last5 = seq.slice(-5);
  let streak = 0, type = null;
  for (let i = seq.length - 1; i >= 0; i--) {
    if (type === null) { type = seq[i]; streak = 1; }
    else if (seq[i] === type) streak++;
    else break;
  }
  return { last5, streak, type };
}

// ============================================================
