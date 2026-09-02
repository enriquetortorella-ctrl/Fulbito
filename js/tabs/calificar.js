// RATE TAB
// ============================================================
function renderRate() {
  const list = document.getElementById('rate-list');
  if (state.currentUser?.supportMode) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🛡️</div><div>Modo soporte</div><div class="sec-note" style="margin-top:8px">Las calificaciones son personales. Volvé a tu club para votar.</div></div>`;
    return;
  }
  const myId = state.currentUser.id;

  const others = state.players.filter(p => p.id !== myId);
  const toRate = others;

  if (!toRate.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⭐</div><div>No hay compañeros para calificar</div></div>`;
    return;
  }

  list.innerHTML = toRate.map((p, idx) => {
    const myRating = p.ratings?.[myId] || {};
    const hasVoted = Object.keys(myRating).length > 0;
    const playerStats = getRatingStats(p);
    const statsHTML = playerStats.map(s => {
      const val = getStatValue(myRating, s);
      const stars = [1,2,3,4,5].map(n=>`<span class="star${n<=val?' lit':''}" onclick="rateStat('${p.id}','${s}',${n})"  data-pid="${p.id}" data-stat="${s}" data-val="${n}">★</span>`).join('');
      return `<div class="rate-stars-row">
        <div class="rate-stars-label">${STAT_LABELS[s]}</div>
        <div class="stars" id="stars-${p.id}-${s}">${stars}</div>
      </div>`;
    }).join('');

    return `<div class="rate-player">
      <div class="rate-player-header" onclick="toggleRatePlayer('${p.id}')">
        <div style="font-size:24px">${posEmoji(getEffectivePosition(p))}</div>
        <div class="rate-player-name">${p.name}</div>
        ${hasVoted?`<div class="rate-player-voted">✓ Votado</div>`:''}
        <div style="font-size:12px;color:var(--muted)">▼</div>
      </div>
      <div id="rate-body-${p.id}" style="display:none">${statsHTML}</div>
    </div>`;
  }).join('');
}

function toggleRatePlayer(id) {
  const body = document.getElementById('rate-body-'+id);
  body.style.display = body.style.display==='none' ? 'block' : 'none';
}

async function rateStat(playerId, stat, val) {
  if (state.currentUser?.supportMode) { showToast('🛡️ El soporte no puede emitir votos.'); return; }
  const myId = state.currentUser.id;
  if (playerId === myId) { showToast('⚠️ No podés calificarte a vos mismo.'); return; }
  const p = state.players.find(x=>x.id===playerId);
  if (!p) return;
  try {
    const data = await callRpc('fulbito_rate_player', {
      p_club_id: state.currentClub.id,
      p_player_id: playerId,
      // La RPC mantiene "atajadas" como nombre de almacenamiento heredado.
      // En la app y para los jugadores, ATA es siempre Ataque.
      p_stat: stat === 'ataque' ? 'atajadas' : stat,
      p_value: val
    });
    const saved = mapPlayers([data])[0];
    // No mostramos un éxito optimista: la respuesta debe traer la estrella
    // recién guardada. Así una falla del servidor no queda disimulada en pantalla.
    if (!saved || getStatValue(saved.ratings?.[myId], stat) !== val) {
      throw new Error('La calificación no quedó confirmada. Actualizá la app e intentá de nuevo.');
    }
    Object.assign(p, saved);
  } catch (error) { showToast(`❌ ${error.message}`); return; }
  const container = document.getElementById(`stars-${playerId}-${stat}`);
  if (container) {
    container.innerHTML = [1,2,3,4,5].map(n=>`<span class="star${n<=val?' lit':''}" onclick="rateStat('${playerId}','${stat}',${n})">★</span>`).join('');
  }
  const hasAllStats = getRatingStats(p).every(s => getStatValue(p.ratings[myId], s) > 0);
  const header = document.querySelector(`#rate-body-${playerId}`)?.previousElementSibling;
  if (header && hasAllStats) {
    let badge = header.querySelector('.rate-player-voted');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'rate-player-voted';
      header.insertBefore(badge, header.lastElementChild);
    }
    badge.textContent = '✓ Votado';
  }
  showToast(`⭐ ${STAT_LABELS[stat]}: ${val}/5`);
}

function exportVotesCSV() {
  const idToName = {};
  state.players.forEach(p => { idToName[p.id] = p.username; });

  const { biases, globalAvg } = computeVoterBiases();

  const exportStats = [...FIELD_STATS, ...GOALKEEPER_STATS];
  const headers = ['Votante', 'Bias', 'Votado', 'Modo', ...exportStats.map(s=>STAT_LABELS[s]), ...exportStats.map(s=>STAT_LABELS[s]+'_norm')];
  const rows = [headers];

  state.players.forEach(votado => {
    const ratings = votado.ratings || {};
    Object.entries(ratings).forEach(([voterId, rating]) => {
      if (voterId === votado.id) return;
      const votanteName = idToName[voterId] || voterId;
      const bias = biases[voterId] !== undefined ? biases[voterId].toFixed(2) : '0';
      const playerStats = getRatingStats(votado);
      const rawVals = exportStats.map(s => playerStats.includes(s) ? getStatValue(rating, s) || '' : '');
      const normVals = exportStats.map(s => {
        if (!playerStats.includes(s)) return '';
        const value = getStatValue(rating, s);
        return value > 0 ? normalizeVote(value, voterId).toFixed(2) : '';
      });
      rows.push([votanteName, bias, votado.username, usesGoalkeeperStats(votado) ? 'Arquero' : 'Campo', ...rawVals, ...normVals]);
    });
  });

  rows.push([]);
  rows.push(['=== BIAS POR VOTANTE ===']);
  rows.push(['Votante', 'Bias', 'Interpretación']);
  Object.entries(biases).sort((a,b) => b[1]-a[1]).forEach(([vid, b]) => {
    const name = idToName[vid] || vid;
    let label;
    if (Math.abs(b) < 0.15) label = 'Neutro';
    else if (b > 0.4) label = 'Muy generoso (vota alto)';
    else if (b > 0.15) label = 'Generoso';
    else if (b < -0.4) label = 'Muy severo (vota bajo)';
    else label = 'Severo';
    rows.push([name, b.toFixed(2), label]);
  });
  rows.push([]);
  rows.push(['Promedio global:', globalAvg.toFixed(2)]);

  rows.push([]);
  rows.push(['=== RESUMEN POR JUGADOR ===']);
  rows.push(['Jugador', 'Posición', 'Modo', 'OVR', 'Votos válidos', 'PJ', 'V', 'E', 'D', 'Pts', 'MVPs', 'Goles', 'PJ con goles registrados', 'G/PJ', 'Asistencias', 'PJ con asistencias registradas', 'A/PJ', ...exportStats.map(s=>STAT_LABELS[s]+' prom')]);
  state.players.forEach(p => {
    const ovr = getOverall(p) || '-';
    const pos = getEffectivePosition(p);
    const validCount = getValidRatings(p).length;
    const avg = getAvgStats(p) || {};
    const rec = getPlayerRecord(p.id);
    rows.push([p.username, pos, usesGoalkeeperStats(p) ? 'Arquero' : 'Campo', ovr, validCount, rec.pj, rec.w, rec.d, rec.l, rec.pts, rec.mvps, rec.goals, rec.goalPj, rec.goalPj ? (rec.goals/rec.goalPj).toFixed(2) : '', rec.assistPj ? rec.assists : '', rec.assistPj || '', rec.assistPj ? (rec.assists/rec.assistPj).toFixed(2) : '', ...exportStats.map(s => avg[s] || '-')]);
  });

  rows.push([]);
  rows.push(['=== HISTORIAL DE PARTIDOS ===']);
  rows.push(['Fecha', 'Equipos', 'Resultado', 'Marcador', 'Margen', 'MVP', 'Goleadores', 'Asistidores', 'Detalle de asistencias', 'Estado asistencias']);
  matches.forEach(m => {
    const teamsStr = (m.teams||[]).map((t,i)=>`${TEAM_NAMES[i]}: ${(t.players||[]).map(p=>p.name).join(' / ')}`).join(' || ');
    let resStr = 'Pendiente', marginStr = '', mvpStr = '';
    if (isPlayed(m)) {
      if (m.result.winner === 'draw') resStr = 'Empate';
      else { resStr = 'Ganó ' + TEAM_NAMES[m.result.winner]; marginStr = marginLabel(m.result.margin); }
      if (m.result.mvp) {
        const all = (m.teams||[]).flatMap(t=>t.players||[]);
        mvpStr = all.find(p=>p.id===m.result.mvp)?.name || '';
      }
    }
    const scoreStr = matchHasGoals(m) ? matchScoreStr(m) : '';
    const scorersStr = matchScorers(m).map(s => `${s.name} (${s.goals})`).join(' / ');
    const assistComplete = hasAssistsTracking(m);
    const assistEvents = getGoalEvents(m);
    const assistersStr = assistEvents.length ? matchAssisters(m).map(a => `${a.name} (${a.assists})`).join(' / ') : '';
    const assistDetail = assistEvents.length
      ? assistEvents.map(event => event.assistType === 'player'
        ? `${matchPlayerName(m, event.scorerId)} ← ${matchPlayerName(m, event.assistPlayerId)}`
        : `${matchPlayerName(m, event.scorerId)} ← ${event.assistType === 'individual' ? 'Jugada individual' : event.assistType === 'rebound' ? 'Rebote' : 'Sin registrar'}`).join(' / ')
      : '';
    const assistStatus = !hasGoalsTracking(m) ? 'Sin planilla'
      : assistComplete ? (isPlayed(m) ? 'Completo' : 'Abierto · completo hasta ahora')
      : assistEvents.length ? 'Parcial — fuera de estadísticas'
      : 'Sin detalle — fuera de estadísticas';
    rows.push([m.match_date || '', teamsStr, resStr, scoreStr, marginStr, mvpStr, scorersStr, assistersStr, assistDetail, assistStatus]);
  });

  const csv = rows.map(row => row.map(cell => {
    let str = String(cell ?? '');
    // Evita que nombres u otros textos editables se interpreten como fórmulas
    // al abrir el archivo en Excel, sin convertir números negativos en texto.
    if (/^[\t\r ]*[=+@]/.test(str) || /^[\t\r ]*-(?!\d+(?:[.,]\d+)?$)/.test(str)) str = `'${str}`;
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g,'""')}"`
      : str;
  }).join(',')).join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0,10);
  a.download = `fulbito_votos_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 CSV descargado');
}

async function resetAllRatings() {
  if (!state.currentUser?.isAdmin) { showToast('⚠️ Solo un admin puede borrar las calificaciones'); return; }
  if (!await confirmAppAction({ title: 'BORRAR CALIFICACIONES', message: 'Se borrarán todas las calificaciones del club. Esta acción no se puede deshacer.', confirmText: 'Sí, borrar', danger: true })) return;
  try {
    await callRpc('fulbito_clear_ratings', { p_club_id: state.currentClub.id });
    state.players.forEach(p => p.ratings = {});
    renderRate();
    renderPlayers();
    showToast('🗑️ Calificaciones borradas');
  } catch (error) { showToast(`❌ ${error.message}`); }
}

// ============================================================
