// PARTIDOS — historial. Posiciones vive en su pestaña propia.
// ============================================================
function renderPartidos() {
  renderHistorial();
}

function marginLabel(margin) {
  return { 1:'por 1', 2:'por 2', 3:'goleada (3+)' }[margin] || '';
}

function formatMatchDate(m) {
  const d = m.match_date || (m.created_at || '').slice(0,10);
  if (!d) return 'Sin fecha';
  const [y,mo,day] = d.split('-');
  return `${day}/${mo}/${y}`;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d)) return null;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

async function saveMatchFromTeams() {
  const teams = state.builtTeams;
  if (!teams || !teams.length) return;
  if (!await confirmAppAction({ title: 'GUARDAR PARTIDO', message: 'Se guardará el partido y se abrirá la planilla de goles.', confirmText: 'Guardar partido' })) return;

  const m = {
    id: `m${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    match_date: new Date().toISOString().slice(0,10),
    teams: teams.map((t, i) => ({
      name: TEAM_NAMES[i] || String(i+1),
      players: t.players.map(p => ({
        id: p.id,
        name: p.name,
        ovr: p.ovr || getOverall(p) || 60,
        pos: p.effPos || 'MED',
        isGuest: !!p.isGuest
      }))
    })),
    // La planilla sólo cuenta desde que alguien decide cargarla en Goles.
    // Así los clubes que sólo anotan quién ganó no alteran las estadísticas
    // de goles ni los promedios.
    result: { winner: null, margin: null, mvp: null, goals: {}, goalEvents: [], goalEventMutationIds: [], goalsTracked: false, assistsTracked: true },
    created_by: state.currentUser.id
  };
  matches.unshift(m);
  sortMatches();
  const saved = await upsertMatch(m);
  if (!saved) {
    matches = matches.filter(item => item.id !== m.id);
    renderHub();
    return;
  }
  renderHub();
  showToast('💾 Partido guardado — anotá los goles acá');
  openGolesFor(m.id);
}

// Editar fecha del partido (admin) — se guarda al instante
async function updateMatchDate(id, val) {
  const m = matches.find(x => x.id === id);
  if (!m || !val) return;
  m.match_date = val;
  await upsertMatch(m);
  sortMatches();
  renderHub();
  renderHistorial();
  renderPlayers();
  showToast('📅 Fecha actualizada');
}

function renderHistorial() {
  const el = document.getElementById('partidos-historial');
  const isAdmin = state.currentUser && state.currentUser.isAdmin;

  if (!matches.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📜</div>
      <div>Todavía no hay partidos guardados.</div>
      <div style="font-size:12px;margin-top:6px">Armá los equipos en la pestaña 🏆 Equipos y tocá "Guardar partido".</div>
    </div>`;
    return;
  }

  // Resumen del historial
  const played = matches.filter(isPlayed);
  const draws = played.filter(m => m.result.winner === 'draw').length;
  const routs = played.filter(m => m.result.margin === 3).length;
  const pending = matches.length - played.length;
  const totalGoles = matches.reduce((a,m) => a + matchTotalGoals(m), 0);
  let summary = `<div class="match-summary">
    <span class="chip">🎮 <b>${played.length}</b>&nbsp;jugado${played.length===1?'':'s'}</span>
    <span class="chip" style="color:#60a5fa">🤝 <b>${draws}</b>&nbsp;empate${draws===1?'':'s'}</span>
    <span class="chip" style="color:var(--gold)">💥 <b>${routs}</b>&nbsp;goleada${routs===1?'':'s'}</span>
    ${totalGoles>0?`<span class="chip" style="color:var(--green)">⚽ <b>${totalGoles}</b>&nbsp;gol${totalGoles===1?'':'es'}</span>`:''}
    ${pending>0?`<span class="chip" style="color:var(--gold)">⏳ <b>${pending}</b>&nbsp;abierto${pending===1?'':'s'}</span>`:''}
  </div>`;

  el.innerHTML = summary + matches.map(m => {
    const teams = m.teams || [];
    const res = isPlayed(m) ? m.result : null;
    const hasGoals = matchHasGoals(m);
    const sc = matchScore(m);

    let badge;
    if (!res) badge = `<span class="match-badge pend">⏳ ${hasGoals ? 'En juego ' + matchScoreStr(m) : 'Sin resultado'}</span>`;
    else if (res.winner === 'draw') badge = `<span class="match-badge draw">🤝 Empate${hasGoals?' '+matchScoreStr(m):''}</span>`;
    else {
      const detail = hasGoals ? matchScoreStr(m) : marginLabel(res.margin);
      badge = `<span class="match-badge win">🏆 Ganó Equipo ${TEAM_NAMES[res.winner]}${detail ? ' ' + detail : ''}</span>`;
    }

    // Fecha: editable inline para admin, texto para el resto
    const dateHTML = isAdmin
      ? `<span style="display:inline-flex;align-items:center;gap:6px"><span style="font-size:15px">📅</span><input type="date" class="match-date-input" value="${m.match_date||''}" onchange="updateMatchDate('${m.id}',this.value)" title="Editar fecha del partido"></span>`
      : `<span class="match-date">📅 ${formatMatchDate(m)}</span>`;

    const goals = getGoals(m);
    const assistsByPlayer = Object.fromEntries(matchAssisters(m).map(item => [item.id, item.assists]));
    const teamsHTML = teams.map((t, i) => {
      const isWinner = res && res.winner === i;
      const names = (t.players||[]).map(p => {
        const mvpStar = res && res.mvp === p.id ? ' ⭐' : '';
        const gn = goals[p.id] || 0;
        const golTxt = gn > 0 ? ` <span style="color:var(--green);font-weight:700">${'⚽'.repeat(Math.min(gn,3))}${gn>3?'×'+gn:''}</span>` : '';
        const an = assistsByPlayer[p.id] || 0;
        const assistTxt = an > 0 ? ` <span style="color:#c4b5fd;font-weight:700">🎯${an}</span>` : '';
        return (p.isGuest ? p.name+' 👤' : p.name) + mvpStar + golTxt + assistTxt;
      }).join('<br>');
      const goalsTeam = hasGoals ? `<span class="match-score">${sc[i]}</span>` : '';
      return `<div class="match-team t${i}${isWinner?' winner':''}">
        <div class="match-team-name">${isWinner?'🏆 ':''}EQUIPO ${TEAM_NAMES[i]}${goalsTeam}</div>
        <div class="match-team-players">${names}</div>
      </div>`;
    }).join('');

    let mvpHTML = '';
    if (res && res.mvp) {
      const all = teams.flatMap(t => t.players || []);
      const mvpPlayer = all.find(p => p.id === res.mvp);
      if (mvpPlayer) mvpHTML = `<div class="match-mvp">⭐ MVP del partido: <b>${mvpPlayer.name}</b></div>`;
    }

    let actions = `<div class="match-actions">`;
    actions += `<button class="btn btn-ghost btn-sm" onclick="openGolesFor('${m.id}')">⚽ Goles</button>`;
    if (isAdmin) {
      actions += !res
        ? `<button class="btn btn-primary btn-sm" onclick="openResultModal('${m.id}')">📋 Cargar resultado</button>`
        : `<button class="btn btn-ghost btn-sm" onclick="openResultModal('${m.id}')">✏️ Editar resultado</button>`;
    }
    actions += `<button class="btn btn-ghost btn-sm" onclick="shareMatchResult('${m.id}')">📲 Compartir</button>`;
    if (isAdmin) {
      actions += `<button class="btn btn-danger btn-sm" onclick="removeMatch('${m.id}')">🗑️</button>`;
    }
    actions += `</div>`;

    return `<div class="match-card${!res?' pending':''}">
      <div class="match-head">
        ${dateHTML}
        ${badge}
      </div>
      <div class="match-teams">${teamsHTML}</div>
      ${mvpHTML}
      ${actions}
    </div>`;
  }).join('');
}

async function removeMatch(id) {
  if (!await confirmAppAction({ title: 'ELIMINAR PARTIDO', message: 'El partido se eliminará del historial. Esta acción no se puede deshacer.', confirmText: 'Sí, eliminar', danger: true })) return;
  matches = matches.filter(m => m.id !== id);
  await deleteMatchDb(id);
  renderHistorial();
  renderPlayers();
  showToast('🗑️ Partido eliminado');
}

// --- modal de resultado ---
let resultMatchId = null;
let resultWinner = null;
let resultMargin = null;
let resultMvp = null;
let resultTracksGoals = false;

function openResultModal(mid) {
  const m = matches.find(x => x.id === mid);
  if (!m) return;
  resultMatchId = mid;
  resultWinner = isPlayed(m) ? m.result.winner : null;
  resultMargin = isPlayed(m) ? m.result.margin : null;
  resultMvp = (m.result && m.result.mvp) || null;
  resultTracksGoals = hasGoalsTracking(m);
  renderResultModal();
  openModal('modal-result');
}

function setResultWinner(w) {
  resultWinner = w;
  if (w === 'draw') resultMargin = null;
  renderResultModal();
}

function setResultMargin(mg) {
  resultMargin = mg;
  renderResultModal();
}

function setResultTracksGoals(enabled) {
  resultTracksGoals = !!enabled;
  if (!resultTracksGoals) resultMargin = null;
  renderResultModal();
}

function setResultMvp(pid) {
  resultMvp = pid;
  renderResultModal();
}

function applyScoreToResult() {
  const m = matches.find(x => x.id === resultMatchId);
  if (!m) return;
  const sc = matchScore(m);
  const max = Math.max(...sc);
  const ordenados = [...sc].sort((a,b)=>b-a);
  if (sc.filter(s => s === max).length > 1) { resultWinner = 'draw'; resultMargin = null; }
  else { resultWinner = sc.indexOf(max); resultMargin = Math.min(3, Math.max(1, max - ordenados[1])); }
  const scorers = matchScorers(m);
  if (!resultMvp && scorers[0]) resultMvp = scorers[0].id;
  renderResultModal();
}

function renderResultModal() {
  const m = matches.find(x => x.id === resultMatchId);
  if (!m) return;
  const teams = m.teams || [];

  let html = `<div class="text-muted" style="margin-bottom:6px">Partido del ${formatMatchDate(m)}</div>`;

  html += `<div style="margin-top:12px;padding:11px;border:1px solid var(--border);border-radius:10px;background:var(--bg3)">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Cómo registrar el partido</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm ${!resultTracksGoals?'btn-primary':'btn-ghost'}" onclick="setResultTracksGoals(false)">🏆 Solo ganador</button>
      <button class="btn btn-sm ${resultTracksGoals?'btn-primary':'btn-ghost'}" onclick="setResultTracksGoals(true)">⚽ Con planilla de goles</button>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:7px;line-height:1.4">${resultTracksGoals ? 'Este partido contará para goles, asistencias y promedios. Podés completar o ajustar la planilla en Goles.' : 'Se guarda quién ganó y el MVP, sin marcador, goles ni asistencias en las estadísticas.'}</div>
  </div>`;

  if (matchHasGoals(m)) {
    html += `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-top:10px;display:flex;align-items:center;gap:10px">
      <div style="flex:1">
        <div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px">Marcador de la planilla</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px">${matchScoreStr(m)}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="applyScoreToResult()">Usar marcador</button>
    </div>`;
  }

  html += `<div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px">¿Quién ganó?</div>`;
  html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">`;
  teams.forEach((t, i) => {
    const active = resultWinner === i;
    html += `<button class="btn ${active?'btn-primary':'btn-ghost'}" style="flex:1;min-width:90px;justify-content:center" onclick="setResultWinner(${i})">Equipo ${TEAM_NAMES[i]}</button>`;
  });
  html += `<button class="btn ${resultWinner==='draw'?'btn-primary':'btn-ghost'}" style="flex:1;min-width:90px;justify-content:center" onclick="setResultWinner('draw')">🤝 Empate</button>`;
  html += `</div>`;

  if (resultTracksGoals && resultWinner !== null && resultWinner !== 'draw') {
    html += `<div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px">¿Por cuánto?</div>`;
    html += `<div style="display:flex;gap:8px;margin-bottom:8px">`;
    [[1,'Por 1'],[2,'Por 2'],[3,'Goleada 3+']].forEach(([v,label]) => {
      const active = resultMargin === v;
      html += `<button class="btn ${active?'btn-primary':'btn-ghost'}" style="flex:1;justify-content:center" onclick="setResultMargin(${v})">${label}</button>`;
    });
    html += `</div>`;
  }

  // MVP opcional (aparece cuando ya hay resultado elegido)
  if (resultWinner !== null) {
    const allPlayers = teams.flatMap(t => t.players || []);
    const goals = getGoals(m);
    html += `<div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px">⭐ MVP del partido (opcional)</div>`;
    html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">`;
    html += `<button class="btn btn-sm ${resultMvp===null?'btn-primary':'btn-ghost'}" onclick="setResultMvp(null)">Sin MVP</button>`;
    allPlayers.forEach(p => {
      const active = resultMvp === p.id;
      const gn = goals[p.id] || 0;
      html += `<button class="btn btn-sm ${active?'btn-primary':'btn-ghost'}" onclick="setResultMvp('${p.id}')">${active?'⭐ ':''}${p.name}${p.isGuest?' 👤':''}${gn?` ⚽${gn}`:''}</button>`;
    });
    html += `</div>`;
  }

  const ready = resultWinner !== null && (!resultTracksGoals || resultWinner === 'draw' || resultMargin !== null);
  html += `<button class="btn btn-green w-full" style="justify-content:center;margin-top:14px" ${ready?'':'disabled'} onclick="saveMatchResult()">✅ Guardar resultado</button>`;

  document.getElementById('modal-result-content').innerHTML = html;
}

async function saveMatchResult() {
  await reconcilePendingGoalWrites();
  const m = matches.find(x => x.id === resultMatchId);
  if (!m) return;
  if (resultWinner === null) return;
  const goals = getGoals(m);
  m.result = {
    ...(m.result || {}),
    winner: resultWinner,
    margin: resultTracksGoals && resultWinner !== 'draw' ? resultMargin : null,
    mvp: resultMvp || null,
    // Conservamos una planilla previa si se edita el modo, pero sólo se usa
    // para estadísticas cuando el administrador confirma que se registra.
    goals,
    goalsTracked: resultTracksGoals
  };
  const saved = await upsertMatch(m);
  if (!saved) return;
  closeModal('modal-result');
  renderHub();
  renderPartidos();
  renderPlayers();
  showToast('✅ Resultado guardado');
}

// Compartir el resultado de un partido del historial
async function shareMatchResult(id) {
  const m = matches.find(x => x.id === id);
  if (!m) return;
  const res = isPlayed(m) ? m.result : null;
  const hasGoals = matchHasGoals(m);
  const sc = matchScore(m);
  const goals = getGoals(m);
  const assistsByPlayer = Object.fromEntries(matchAssisters(m).map(item => [item.id, item.assists]));

  let text = `⚽ EL FULBITO — ${formatMatchDate(m)}\n`;
  if (!res) text += hasGoals ? `⏳ En juego: ${matchScoreStr(m)}\n` : '⏳ Resultado pendiente\n';
  else if (res.winner === 'draw') text += `🤝 Empate${hasGoals?' '+matchScoreStr(m):''}\n`;
  else {
    const detail = hasGoals ? matchScoreStr(m) : marginLabel(res.margin);
    text += `🏆 Ganó Equipo ${TEAM_NAMES[res.winner]}${detail ? ' ' + detail : ''}\n`;
  }

  (m.teams||[]).forEach((t, i) => {
    text += `\n${TEAM_EMOJIS[i]||'⚪'} EQUIPO ${TEAM_NAMES[i]}${hasGoals?` (${sc[i]})`:''}${res && res.winner===i ? ' 🏆' : ''}\n`;
    (t.players||[]).forEach(p => {
      const gn = goals[p.id] || 0;
      const an = assistsByPlayer[p.id] || 0;
      text += `• ${p.name}${p.isGuest?' 👤':''}${gn?` ⚽${gn}`:''}${an?` 🎯${an} asist.`:''}${res && res.mvp===p.id ? ' ⭐MVP' : ''}\n`;
    });
    const sinAutor = goals['__t'+i] || 0;
    if (sinAutor) text += `• (sin autor) ⚽${sinAutor}\n`;
  });

  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch(e) { /* cancelado */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('📋 Resultado copiado — pegalo en WhatsApp');
  } catch(e) {
    showToast('❌ No se pudo copiar');
  }
}

// --- ranking ---
let rankingYear = 'all';
function setRankingYear(y) { rankingYear = y; renderRanking(); }

function renderRanking() {
  const el = document.getElementById('posiciones-content');

  const years = [...new Set(
    matches.filter(isPlayed).map(m => (m.match_date||'').slice(0,4)).filter(Boolean)
  )].sort().reverse();
  if (rankingYear !== 'all' && !years.includes(rankingYear)) rankingYear = 'all';

  let yearFilterHTML = '';
  if (years.length > 1) {
    yearFilterHTML = `<div class="period-bar leaderboard-periods">
      <button class="btn btn-sm ${rankingYear==='all'?'btn-primary':'btn-ghost'}" onclick="setRankingYear('all')">🏛️ Histórico</button>
      ${years.map(y=>`<button class="btn btn-sm ${rankingYear===y?'btn-primary':'btn-ghost'}" onclick="setRankingYear('${y}')">${y}</button>`).join('')}
    </div>`;
  }

  const yearArg = rankingYear === 'all' ? null : rankingYear;
  const ranked = state.players
    .map(p => ({ p, ...getPlayerRecord(p.id, yearArg) }))
    .filter(r => r.pj > 0)
    .sort((a,b) => b.pts - a.pts || b.w - a.w || a.pj - b.pj || a.p.name.localeCompare(b.p.name));

  if (!ranked.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🏅</div>
      <div>Todavía no hay partidos con resultado.</div>
      <div style="font-size:12px;margin-top:6px">Los puntos: victoria = 3, empate = 1.</div>
    </div>`;
    return;
  }

  const medals = ['🥇','🥈','🥉'];
  const leader = ranked[0];
  const runner = ranked[1] || null;
  const highlights = typeof leaderboardHighlights === 'function' ? leaderboardHighlights() : null;

  let html = `${yearFilterHTML}<section class="leaderboard-page positions-page">
    <header class="leaderboard-page-head"><div><span>TABLA GENERAL</span><h2>POSICIONES</h2><p>Victoria = 3 puntos · Empate = 1 punto</p></div><div class="leaderboard-page-total"><b>${leader.pts}</b><span>Puntos del líder</span></div></header>
    <div class="leaderboard-podium positions-podium">
      ${typeof leaderboardCard === 'function' ? leaderboardCard(leader, '1°', 'LÍDER DE LA TABLA', leader.pts, 'PUNTOS', `${leader.w}V · ${leader.d}E · ${leader.l}D · ${leader.pj} PJ`, highlights, 'is-champion') : ''}
      ${runner && typeof leaderboardCard === 'function' ? leaderboardCard(runner, '2°', 'SEGUNDO PUESTO', runner.pts, 'PUNTOS', `${runner.w}V · ${runner.d}E · ${runner.l}D · ${runner.pj} PJ`, highlights, 'is-runner') : ''}
    </div>
    <div class="positions-table-title">Tabla de puntos</div>
    <div class="rank-header">
    <div style="width:30px;text-align:center">#</div>
    <div style="flex:1">Jugador</div>
    <div class="rank-cells">
      <div class="rank-cell">PJ</div>
      <div class="rank-cell">V</div>
      <div class="rank-cell">E</div>
      <div class="rank-cell">D</div>
    </div>
    <div style="width:44px;text-align:center">Pts</div>
    </div>`;

  html += ranked.map((r, i) => {
    const posLabel = medals[i] || (i+1);
    const form = getPlayerForm(r.p.id);
    const dots = form.last5.map(x=>`<span class="form-dot ${x==='V'?'fd-v':x==='E'?'fd-e':'fd-d'}">${x}</span>`).join('');
    let streakHTML = '';
    if (form.streak >= 2) {
      if (form.type === 'V') streakHTML = `<span style="color:var(--gold);font-weight:700">🔥${form.streak}V</span>`;
      else if (form.type === 'D') streakHTML = `<span style="opacity:.7">🥶${form.streak}D</span>`;
    }
    const mvpHTML = r.mvps > 0 ? `<span style="color:var(--gold);font-weight:700">⭐${r.mvps}</span>` : '';
    const golHTML = r.goals > 0 ? `<span style="color:var(--green);font-weight:700">⚽${r.goals}</span>` : '';
    const subHTML = (form.last5.length || streakHTML || mvpHTML || golHTML)
      ? `<div class="rank-sub">${dots}${streakHTML?'&nbsp;'+streakHTML:''}${mvpHTML?'&nbsp;'+mvpHTML:''}${golHTML?'&nbsp;'+golHTML:''}</div>`
      : '';

    return `<div class="rank-row${i===0?' top1':''}" onclick="openPlayerProfile('${r.p.id}')" style="cursor:pointer">
      <div class="rank-pos">${posLabel}</div>
      <div class="rank-name">${r.p.name}${subHTML}</div>
      <div class="rank-cells">
        <div class="rank-cell"><b>${r.pj}</b><span>PJ</span></div>
        <div class="rank-cell"><b style="color:var(--green)">${r.w}</b><span>V</span></div>
        <div class="rank-cell"><b style="color:#60a5fa">${r.d}</b><span>E</span></div>
        <div class="rank-cell"><b style="color:var(--red)">${r.l}</b><span>D</span></div>
      </div>
      <div class="rank-pts"><b>${r.pts}</b><span>pts</span></div>
    </div>`;
  }).join('');

  html += `<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:12px;line-height:1.6">Victoria = 3 pts · Empate = 1 pt · ⭐ = veces MVP · ⚽ = goles · Cuadraditos = últimos 5 partidos<br>Los invitados no suman al ranking</div></section>`;

  el.innerHTML = html;
}

// ============================================================
