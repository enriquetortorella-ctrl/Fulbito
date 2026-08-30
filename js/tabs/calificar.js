// RATE TAB
// ============================================================
function renderRate() {
  const list = document.getElementById('rate-list');
  if (state.currentUser?.supportMode) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🛡️</div><div>Modo soporte</div><div class="sec-note" style="margin-top:8px">Las calificaciones son personales. Volvé a tu club para votar.</div></div>`;
    return;
  }
  const myId = state.currentUser.id;

  const me = state.players.find(p => p.id === myId);
  const others = state.players.filter(p => p.id !== myId);
  const toRate = me ? [me, ...others] : others;

  if (!toRate.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⭐</div><div>No hay compañeros para calificar</div></div>`;
    return;
  }

  list.innerHTML = toRate.map((p, idx) => {
    const isSelf = p.id === myId;
    const myRating = p.ratings?.[myId] || {};
    const hasVoted = Object.keys(myRating).length > 0;
    const statsHTML = STATS.map(s => {
      const val = myRating[s] || 0;
      const stars = [1,2,3,4,5].map(n=>`<span class="star${n<=val?' lit':''}" onclick="rateStat('${p.id}','${s}',${n})"  data-pid="${p.id}" data-stat="${s}" data-val="${n}">★</span>`).join('');
      return `<div class="rate-stars-row">
        <div class="rate-stars-label">${STAT_LABELS[s]}</div>
        <div class="stars" id="stars-${p.id}-${s}">${stars}</div>
      </div>`;
    }).join('');

    const selfBanner = isSelf ? `<div style="background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.3);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:12px;color:var(--gold);line-height:1.4">⭐ <strong>Autocalificación</strong> — cómo te ves vos mismo. No afecta el overall del plantel.</div>` : '';

    return `<div class="rate-player" style="${isSelf?'border-color:var(--gold)':''}">
      <div class="rate-player-header" onclick="toggleRatePlayer('${p.id}')">
        <div style="font-size:24px">${isSelf?'⭐':posEmoji(getEffectivePosition(p))}</div>
        <div class="rate-player-name">${isSelf?'Yo (autocalificación)':p.name}</div>
        ${hasVoted?`<div class="rate-player-voted">✓ Votado</div>`:''}
        <div style="font-size:12px;color:var(--muted)">▼</div>
      </div>
      <div id="rate-body-${p.id}" style="display:none">${selfBanner}${statsHTML}</div>
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
  const p = state.players.find(x=>x.id===playerId);
  if (!p) return;
  try {
    const data = await callRpc('fulbito_rate_player', {
      p_club_id: state.currentClub.id,
      p_player_id: playerId,
      p_stat: stat,
      p_value: val
    });
    Object.assign(p, mapPlayers([data])[0]);
  } catch (error) { showToast(`❌ ${error.message}`); return; }
  const container = document.getElementById(`stars-${playerId}-${stat}`);
  if (container) {
    container.innerHTML = [1,2,3,4,5].map(n=>`<span class="star${n<=val?' lit':''}" onclick="rateStat('${playerId}','${stat}',${n})">★</span>`).join('');
  }
  const hasAllStats = STATS.every(s => (p.ratings[myId]?.[s]||0) > 0);
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

  const headers = ['Votante', 'Bias', 'Votado', 'Autovoto', ...STATS.map(s=>STAT_LABELS[s]), ...STATS.map(s=>STAT_LABELS[s]+'_norm')];
  const rows = [headers];

  state.players.forEach(votado => {
    const ratings = votado.ratings || {};
    Object.entries(ratings).forEach(([voterId, rating]) => {
      const votanteName = idToName[voterId] || voterId;
      const esAutovoto = voterId === votado.id ? 'SI' : 'NO';
      const bias = biases[voterId] !== undefined ? biases[voterId].toFixed(2) : '0';
      const rawVals = STATS.map(s => rating[s] || '');
      const normVals = STATS.map(s => rating[s] > 0 ? normalizeVote(rating[s], voterId).toFixed(2) : '');
      rows.push([votanteName, bias, votado.username, esAutovoto, ...rawVals, ...normVals]);
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
  rows.push(['Jugador', 'Posición', 'OVR', 'Votos válidos', 'PJ', 'V', 'E', 'D', 'Pts', 'MVPs', 'Goles', ...STATS.map(s=>STAT_LABELS[s]+' prom')]);
  state.players.forEach(p => {
    const ovr = getOverall(p) || '-';
    const pos = getEffectivePosition(p);
    const validCount = getValidRatings(p).length;
    const avg = getAvgStats(p) || {};
    const rec = getPlayerRecord(p.id);
    rows.push([p.username, pos, ovr, validCount, rec.pj, rec.w, rec.d, rec.l, rec.pts, rec.mvps, rec.goals, ...STATS.map(s => avg[s] || '-')]);
  });

  rows.push([]);
  rows.push(['=== HISTORIAL DE PARTIDOS ===']);
  rows.push(['Fecha', 'Equipos', 'Resultado', 'Marcador', 'Margen', 'MVP', 'Goleadores']);
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
    rows.push([m.match_date || '', teamsStr, resStr, scoreStr, marginStr, mvpStr, scorersStr]);
  });

  const csv = rows.map(row => row.map(cell => {
    const str = String(cell ?? '');
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
  if (!confirm('¿Borrar TODAS las calificaciones?')) return;
  if (!state.currentUser?.isAdmin) { showToast('⚠️ Solo un admin puede borrar las calificaciones'); return; }
  try {
    await callRpc('fulbito_clear_ratings', { p_club_id: state.currentClub.id });
    state.players.forEach(p => p.ratings = {});
    renderRate();
    renderPlayers();
    showToast('🗑️ Calificaciones borradas');
  } catch (error) { showToast(`❌ ${error.message}`); }
}

// ============================================================
