// STATS — panorama, goleadores, récords, duplas, rivalidades y ficha individual
// ============================================================
let statsPeriod = 'all';
let statsPlayerId = 'all';
function setStatsPeriod(p) { statsPeriod = p; renderStats(); }
function setStatsPlayer(id) { statsPlayerId = id; renderStats(); }

function scopedMatches() {
  const played = matches.filter(isPlayed).slice().sort((a,b) =>
    (b.match_date||'').localeCompare(a.match_date||'') ||
    (b.created_at||'').localeCompare(a.created_at||'')
  );
  if (statsPeriod === 'last10') return played.slice(0, 10);
  if (statsPeriod === 'all') return played;
  return played.filter(m => (m.match_date||'').slice(0,4) === statsPeriod);
}

function recordIn(ms, pid) {
  let w=0, d=0, l=0, mvps=0, goals=0, goalPj=0, routs=0;
  ms.forEach(m => {
    const ti = (m.teams||[]).findIndex(t => (t.players||[]).some(p => p.id === pid));
    if (ti === -1) return;
    if (hasGoalsTracking(m)) {
      goals += getGoals(m)[pid] || 0;
      goalPj++;
    }
    if (m.result.winner === 'draw') d++;
    else if (m.result.winner === ti) { w++; if (m.result.margin === 3) routs++; }
    else l++;
    if (m.result.mvp === pid) mvps++;
  });
  const pj = w+d+l;
  return { w, d, l, pj, mvps, goals, goalPj, routs, pts: w*3+d, ppp: pj ? (w*3+d)/pj : 0, wr: pj ? w/pj : 0 };
}

function statsPlayers(ms) {
  return state.players
    .map(p => ({ p, ovr: getOverall(p) || 60, ...recordIn(ms, p.id) }))
    .filter(x => x.pj > 0);
}

function pickTop(arr, cmp) { return arr.length ? arr.slice().sort(cmp)[0] : null; }
function pct(x) { return Math.round(x*100) + '%'; }
function goalsPerGame(record) { return record.goalPj ? record.goals / record.goalPj : 0; }
function goalAverageMinimum(ms) { return Math.max(3, Math.ceil(goalTrackedMatches(ms).length * .30)); }

function statFormDots(playerId, ms) {
  const form = getPlayerForm(playerId, ms);
  if (!form.last5.length) return '<span style="color:var(--muted);font-size:12px">Sin partidos suficientes</span>';
  return form.last5.map(x => `<span class="form-dot ${x==='V'?'fd-v':x==='E'?'fd-e':'fd-d'}">${x}</span>`).join('');
}

function playerLastMatch(playerId, ms) {
  const last = getPlayerMatchesChrono(playerId, ms).slice(-1)[0];
  if (!last) return '';
  const ti = (last.teams||[]).findIndex(t => (t.players||[]).some(p => p.id === playerId));
  const result = last.result.winner === 'draw' ? 'Empate' : last.result.winner === ti ? 'Victoria' : 'Derrota';
  const icon = result === 'Victoria' ? '✅' : result === 'Empate' ? '🤝' : '❌';
  const goals = getGoals(last)[playerId] || 0;
  return `${icon} Último partido: <b>${result}</b> · ${formatMatchDate(last)}${goals ? ` · ⚽ ${goals}` : ''}${last.result.mvp===playerId ? ' · ⭐ MVP' : ''}`;
}

function playerDashboardHTML(ms, player) {
  const rec = recordIn(ms, player.id);
  const gpp = goalsPerGame(rec);
  const presentismo = rec.pj / Math.max(1, ms.length);
  const minGpp = goalAverageMinimum(ms);
  const streak = getMaxWinStreak(player.id, ms);
  const unbeaten = getMaxUnbeatenStreak(player.id, ms);
  const periodLabel = statsPeriod === 'all' ? 'histórico' : statsPeriod === 'last10' ? 'últimos 10 partidos' : statsPeriod;

  return `<div class="admin-section player-hero">
    <div class="player-hero-head">
      <div>
        <div class="player-hero-name">${player.name}</div>
        <div class="player-hero-sub">Expediente individual · ${periodLabel} · ${rec.pj} de ${ms.length} partidos del grupo</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openPlayerProfile('${player.id}')">Ver carta</button>
    </div>
    <div class="stat-chips">
      <div class="stat-chip"><b>${rec.pj}</b><span>PJ</span></div>
      <div class="stat-chip"><b style="color:var(--green)">${pct(rec.wr)}</b><span>Victorias</span></div>
      <div class="stat-chip"><b>${rec.ppp.toFixed(2)}</b><span>Pts / PJ</span></div>
      <div class="stat-chip"><b style="color:var(--green)">⚽ ${rec.goals}</b><span>Goles</span></div>
      <div class="stat-chip"><b style="color:var(--green)">${gpp.toFixed(2)}</b><span>Goles / PJ registrado</span></div>
      <div class="stat-chip"><b style="color:#60a5fa">${pct(presentismo)}</b><span>Presente</span></div>
    </div>
    <div class="form-line"><span>Forma reciente</span>${statFormDots(player.id, ms)}${streak >= 2 ? `<span style="margin-left:5px;color:var(--green)">🔥 ${streak}V seguidas</span>` : ''}</div>
    <div style="position:relative;z-index:1;font-size:11px;color:var(--muted);margin-top:9px;line-height:1.55">${playerLastMatch(player.id, ms)}${unbeaten >= 3 ? ` · 🛡️ ${unbeaten} sin perder` : ''}${rec.mvps ? ` · ⭐ ${rec.mvps} MVP` : ''}<br>${rec.goalPj >= minGpp ? `🎯 Clasifica al promedio goleador (mín. ${minGpp} PJ con registro).` : `🎯 Para clasificar al promedio goleador necesita ${minGpp-rec.goalPj} PJ con registro más.`}</div>
  </div>`;
}

function playerHeadToHeadHTML(ms, player) {
  const { against } = getPairStats(ms);
  const qualified = getPaternidades(ms);
  const rows = Object.entries(against)
    .filter(([key]) => key.split('|').includes(player.id))
    .map(([key, v]) => {
      const other = key.split('|').find(id => id !== player.id);
      const w = v.wins[player.id] || 0;
      const l = v.wins[other] || 0;
      const d = v.draws || 0;
      const tag = qualified.find(x => x.padre === player.id && x.hijo === other) ? 'child'
        : qualified.find(x => x.hijo === player.id && x.padre === other) ? 'parent' : '';
      return { other, w, d, l, games:v.games, wr:w/v.games, ppp:(w*3+d)/v.games, tag };
    })
    .sort((a,b) => b.games-a.games || b.ppp-a.ppp || a.other.localeCompare(b.other));

  if (!rows.length) return `<div class="admin-section"><h3>⚔️ Cruces directos</h3><p class="sec-note">Todavía no hay cruces de ${player.name} contra otros jugadores en este período.</p></div>`;

  const children = rows.filter(x=>x.tag==='child');
  const parents = rows.filter(x=>x.tag==='parent');
  const summary = [
    children.length ? `<span class="chip" style="color:var(--green);border-color:rgba(34,197,94,.35)">👨‍👦 Tiene de hijo a ${children.length}</span>` : '',
    parents.length ? `<span class="chip" style="color:var(--red);border-color:rgba(239,68,68,.35)">🍼 Lo tienen de hijo ${parents.length}</span>` : ''
  ].filter(Boolean).join('');
  const badge = row => row.tag === 'child' ? '👨‍👦' : row.tag === 'parent' ? '🍼' : '⚔️';

  return `<div class="admin-section">
    <h3>⚔️ ${player.name} vs todos</h3>
    <p class="sec-note">Solo cuenta cuando estuvieron en equipos distintos. V-E-D está siempre visto desde ${player.name}.</p>
    ${summary ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${summary}</div>` : ''}
    <div class="table-scroll"><table class="mini-table">
      <thead><tr><th>Rival</th><th>Cruces</th><th>V-E-D</th><th>%V</th><th>Pts/PJ</th></tr></thead>
      <tbody>${rows.map(r => `<tr onclick="openPlayerProfile('${r.other}')">
        <td><span class="h2h-badge">${badge(r)}</span>${playerNameById(r.other)}</td>
        <td>${r.games}</td>
        <td class="h2h-record" style="color:${r.w>r.l?'var(--green)':r.w<r.l?'var(--red)':'var(--gold)'}">${r.w}-${r.d}-${r.l}</td>
        <td style="color:${r.wr>=.6?'var(--green)':r.wr>=.4?'var(--gold)':'var(--red)'}">${pct(r.wr)}</td>
        <td>${r.ppp.toFixed(2)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function playerPartnersHTML(ms, player) {
  const { together } = getPairStats(ms);
  const rows = Object.entries(together)
    .filter(([key]) => key.split('|').includes(player.id))
    .map(([key, v]) => {
      const other = key.split('|').find(id => id !== player.id);
      const pj = v.w + v.d + v.l;
      return { other, ...v, pj, wr:v.w/pj, ppp:(v.w*3+v.d)/pj };
    })
    .sort((a,b) => b.pj-a.pj || b.ppp-a.ppp);
  if (!rows.length) return '';
  const best = rows.filter(r=>r.pj>=2).slice().sort((a,b)=>b.wr-a.wr||b.pj-a.pj)[0];
  const worst = rows.filter(r=>r.pj>=2).slice().sort((a,b)=>a.wr-b.wr||b.pj-a.pj)[0];
  return `<div class="admin-section">
    <h3>🤝 Sociedades de ${player.name}</h3>
    <p class="sec-note">Rendimiento cuando jugaron en el mismo equipo.</p>
    ${best ? `<div class="fact-row"><span class="fact-emoji">✨</span><div><div class="fact-label">Mejor socio</div><div class="fact-val">${playerNameById(best.other)} · ${best.w}V ${best.d}E ${best.l}D (${pct(best.wr)})</div></div></div>` : ''}
    ${worst && worst.other!==best?.other ? `<div class="fact-row"><span class="fact-emoji">🧊</span><div><div class="fact-label">Sociedad más difícil</div><div class="fact-val">${playerNameById(worst.other)} · ${worst.w}V ${worst.d}E ${worst.l}D (${pct(worst.wr)})</div></div></div>` : ''}
    <div class="table-scroll" style="margin-top:8px"><table class="mini-table"><thead><tr><th>Compañero</th><th>PJ</th><th>V-E-D</th><th>%V</th></tr></thead>
      <tbody>${rows.map(r=>`<tr onclick="openPlayerProfile('${r.other}')"><td>🤝 ${playerNameById(r.other)}</td><td>${r.pj}</td><td class="h2h-record" style="color:${r.wr>=.6?'var(--green)':r.wr>=.4?'var(--gold)':'var(--red)'}">${r.w}-${r.d}-${r.l}</td><td>${pct(r.wr)}</td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function renderStats() {
  const el = document.getElementById('partidos-stats');
  const allPlayed = matches.filter(isPlayed);

  if (allPlayed.length < 2) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🧪</div>
      <div>Se necesitan al menos 2 partidos con resultado.</div>
      <div style="font-size:12px;margin-top:6px">Acá van a aparecer goleadores, duplas, rivalidades y récords del grupo.</div>
    </div>`;
    return;
  }

  const years = [...new Set(allPlayed.map(m => (m.match_date||'').slice(0,4)).filter(Boolean))].sort().reverse();
  if (statsPeriod !== 'all' && statsPeriod !== 'last10' && !years.includes(statsPeriod)) statsPeriod = 'all';
  let selectedPlayer = state.players.find(p => p.id === statsPlayerId);
  if (statsPlayerId !== 'all' && !selectedPlayer) { statsPlayerId = 'all'; selectedPlayer = null; }

  let html = `<div class="period-bar">
    <button class="btn btn-sm ${statsPeriod==='all'?'btn-primary':'btn-ghost'}" onclick="setStatsPeriod('all')">🏛️ Histórico</button>
    ${allPlayed.length>10?`<button class="btn btn-sm ${statsPeriod==='last10'?'btn-primary':'btn-ghost'}" onclick="setStatsPeriod('last10')">🔟 Últimos 10</button>`:''}
    ${years.length>1?years.map(y=>`<button class="btn btn-sm ${statsPeriod===y?'btn-primary':'btn-ghost'}" onclick="setStatsPeriod('${y}')">${y}</button>`).join(''):''}
  </div>`;

  html += `<div class="stats-filter-card">
    <label class="stats-filter-label" for="stats-player-select">👤 Ver</label>
    <select id="stats-player-select" class="stats-filter-select" onchange="setStatsPlayer(this.value)">
      <option value="all" ${statsPlayerId==='all'?'selected':''}>🏟️ Estadísticas de todo el grupo</option>
      ${state.players.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${p.id}" ${p.id===statsPlayerId?'selected':''}>${p.name}</option>`).join('')}
    </select>
  </div>`;

  const ms = scopedMatches();
  if (ms.length < 2) {
    html += `<div class="empty-state" style="padding:30px 16px"><div style="font-size:13px">Ese período tiene menos de 2 partidos jugados.</div></div>`;
    el.innerHTML = html;
    return;
  }

  const players = statsPlayers(ms);

  if (selectedPlayer) {
    html += playerDashboardHTML(ms, selectedPlayer);
    html += playerHeadToHeadHTML(ms, selectedPlayer);
    html += playerPartnersHTML(ms, selectedPlayer);
  } else {
    html += panoramaHTML(ms, players);
    html += goleadoresHTML(ms, players);
    html += factsHTML(ms, players);
    html += paternidadesHTML(ms);
    html += rendimientoHTML(ms, players);
    html += duplasHTML(ms);
    html += rivalidadesHTML(ms);
    html += presentismoHTML(ms, players);
    html += votacionHTML();
  }

  el.innerHTML = html;
}

// --- 1. Panorama del ciclo ---
function panoramaHTML(ms, players) {
  const draws = ms.filter(m => m.result.winner === 'draw').length;
  const routs = ms.filter(m => m.result.margin === 3).length;
  const trackedGoals = goalTrackedMatches(ms);
  const goles = trackedGoals.reduce((a,m) => a + matchTotalGoals(m), 0);
  const colorWins = [0,0,0];
  ms.forEach(m => { if (m.result.winner !== 'draw') colorWins[m.result.winner]++; });
  const ultimo = ms[0];
  const dias = daysSince(ultimo && ultimo.match_date);

  const chips = [
    ['🎮', ms.length, 'Partidos'],
    ['🤝', draws, 'Empates'],
    ['💥', routs, 'Goleadas'],
    ['👥', players.length, 'Jugadores'],
  ];
  if (trackedGoals.length) {
    chips.push(['⚽', goles, 'Goles']);
    chips.push(['📊', (goles/trackedGoals.length).toFixed(1), 'Goles/partido reg.']);
  }

  // Partidos por mes (últimos 8 meses con actividad)
  const porMes = {};
  ms.forEach(m => {
    const k = (m.match_date||'').slice(0,7);
    if (!k) return;
    porMes[k] = (porMes[k]||0) + 1;
  });
  const meses = Object.entries(porMes).sort((a,b)=>a[0].localeCompare(b[0])).slice(-8);
  const maxMes = Math.max(1, ...meses.map(([,v])=>v));
  const MES_LBL = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const mesesHTML = meses.length > 1 ? `
    <div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-top:16px">Partidos por mes</div>
    <div class="months">
      ${meses.map(([k,v]) => `<div class="month-col">
        <span class="month-num">${v}</span>
        <div class="month-bar" style="height:${Math.round(v/maxMes*44)+4}px"></div>
        <span class="month-lbl">${MES_LBL[parseInt(k.slice(5,7),10)-1]}</span>
      </div>`).join('')}
    </div>` : '';

  const colorHTML = `<div style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:12px">
    <span style="color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap">Camisetas</span>
    <span style="color:#60a5fa;font-weight:700">🔵 ${colorWins[0]}</span>
    <span style="color:#f87171;font-weight:700">🔴 ${colorWins[1]}</span>
    ${colorWins[2] ? `<span style="color:#c084fc;font-weight:700">🟣 ${colorWins[2]}</span>` : ''}
    <span style="color:var(--muted)">· ${draws} empates</span>
  </div>`;

  return `<div class="admin-section">
    <h3>📊 Panorama del ciclo</h3>
    <div class="stat-chips">
      ${chips.map(([e,v,l]) => `<div class="stat-chip"><b>${e} ${v}</b><span>${l}</span></div>`).join('')}
    </div>
    ${colorHTML}
    ${mesesHTML}
    ${dias !== null ? `<div style="font-size:11px;color:var(--muted);margin-top:12px">⏳ Último partido: ${formatMatchDate(ultimo)} — hace ${dias} día${dias===1?'':'s'}</div>` : ''}
  </div>`;
}

// --- 2. Goleadores ---
function goleadoresHTML(ms, players) {
  const trackedGoals = goalTrackedMatches(ms);
  const goles = trackedGoals.reduce((a,m) => a + matchTotalGoals(m), 0);
  const minGpp = goalAverageMinimum(ms);
  const trackingStart = trackedGoals.length ? formatMatchDate(trackedGoals[trackedGoals.length - 1]) : '';
  if (!trackedGoals.length) {
    return `<div class="admin-section">
      <h3>⚽ Goleadores</h3>
      <p class="sec-note">Todavía no hay partidos marcados con registro de goles en este período.</p>
    </div>`;
  }
  if (!goles) {
    return `<div class="admin-section">
      <h3>⚽ Goleadores</h3>
      <p class="sec-note">Hay ${trackedGoals.length} partido${trackedGoals.length===1?'':'s'} con registro de goles, pero todavía no se cargaron goles. Los 0–0 también cuentan para el promedio.</p>
    </div>`;
  }

  const conGoles = players.filter(x => x.goals > 0).sort((a,b) => b.goals - a.goals || goalsPerGame(b) - goalsPerGame(a));
  const max = Math.max(1, ...conGoles.map(x => x.goals));
  const maxGoleador = conGoles[0];
  const efectivo = pickTop(conGoles.filter(x => x.goalPj >= minGpp), (a,b) => goalsPerGame(b) - goalsPerGame(a) || b.goals-a.goals || b.goalPj-a.goalPj);

  // Récord individual en un partido
  let bestSolo = null;
  trackedGoals.forEach(m => {
    matchScorers(m).forEach(s => {
      if (!bestSolo || s.goals > bestSolo.goals) bestSolo = { ...s, m };
    });
  });
  // Partido con más goles
  const bestMatch = pickTop(trackedGoals.filter(matchHasGoals), (a,b) => matchTotalGoals(b) - matchTotalGoals(a));
  // Sin autor
  const sinAutor = trackedGoals.reduce((a,m) => {
    const g = getGoals(m);
    return a + Object.entries(g).filter(([k]) => k.startsWith('__t')).reduce((x,[,v]) => x+v, 0);
  }, 0);

  const filas = conGoles.slice(0, 10).map((x,i) => `
    <div class="bar-row" onclick="openPlayerProfile('${x.p.id}')" style="cursor:pointer">
      <span class="bar-name">${i===0?'🥇 ':''}${x.p.name}</span>
      <div class="bar-track"><div class="bar-fill green" style="width:${Math.round(x.goals/max*100)}%"></div></div>
      <span class="bar-val" style="color:var(--green)">${x.goals}</span>
      <span class="bar-meta">${x.goalPj} PJ reg. · ${goalsPerGame(x).toFixed(2)} G/PJ</span>
    </div>`).join('');

  const extras = [];
  if (bestSolo) extras.push(`🎯 Mejor marca individual: <b>${bestSolo.name}</b> con ${bestSolo.goals} en un partido (${formatMatchDate(bestSolo.m)})`);
  if (bestMatch) extras.push(`🔥 Partido más goleado: ${matchScoreStr(bestMatch)} el ${formatMatchDate(bestMatch)}`);
  if (sinAutor) extras.push(`⚪ Goles sin autor asignado: ${sinAutor}`);

  const scorerAvatar = (p, cls='') => {
    const url = safePhotoUrl(p.photo);
    return url
      ? `<img class="scorer-avatar ${cls}" src="${escapeHtml(url)}" alt="${escapeHtml(p.name)}">`
      : `<div class="scorer-avatar scorer-avatar-ph ${cls}" aria-hidden="true">👤</div>`;
  };
  const maxGpp = goalsPerGame(maxGoleador);
  const effective = efectivo || maxGoleador;

  return `<section class="admin-section scorers-module">
    <div class="scorers-module-head">
      <div class="scorers-heading"><div class="scorers-icon">🥇</div><div><div class="scorers-kicker">RANKING OFENSIVO · ${trackedGoals.length} PJ REGISTRADOS</div><h3>GOLEADORES</h3></div></div>
      <div class="scorers-head-total"><b>${goles}</b><span>GOLES<br>REGISTRADOS</span></div>
    </div>
    <div class="scorers-featured">
      <article class="scorer-feature scorer-feature-gold">
        <div class="scorer-feature-ribbon">🥇 BOTÍN DE ORO</div>
        <div class="scorer-feature-main">${scorerAvatar(maxGoleador.p,'scorer-feature-avatar')}<div class="scorer-feature-copy"><strong>${maxGoleador.p.name}</strong><span>Máximo goleador del club</span></div><div class="scorer-feature-number"><b>${maxGoleador.goals}</b><small>GOLES</small></div></div>
        <div class="scorer-feature-stats"><span><b>${maxGpp.toFixed(2)}</b> G/PJ</span><span><b>${maxGoleador.goalPj}</b> PJ REG.</span><span><b>${Math.round(maxGoleador.goals / Math.max(1,goles) * 100)}%</b> DEL TOTAL</span></div>
      </article>
      <article class="scorer-feature scorer-feature-ice">
        <div class="scorer-feature-ribbon">🚀 MEJOR PROMEDIO</div>
        <div class="scorer-feature-main">${scorerAvatar(effective,'scorer-feature-avatar')}<div class="scorer-feature-copy"><strong>${efectivo ? efectivo.p.name : 'A definir'}</strong><span>${efectivo ? `mínimo ${minGpp} PJ con registro` : `necesita ${minGpp} PJ registrados`}</span></div><div class="scorer-feature-number"><b>${efectivo ? goalsPerGame(efectivo).toFixed(2) : '—'}</b><small>G/PJ</small></div></div>
        <div class="scorer-feature-stats"><span><b>${efectivo ? efectivo.goals : '—'}</b> GOLES</span><span><b>${efectivo ? efectivo.goalPj : '—'}</b> PJ REG.</span><span><b>${efectivo ? Math.round(goalsPerGame(efectivo)*10)/10 : '—'}</b> MEDIA</span></div>
      </article>
    </div>
    <div class="scorers-list-head"><span>JUGADOR</span><span>GOLES</span><span>G/PJ</span><span>PARTICIPACIÓN</span></div>
    <div class="scorers-list">${conGoles.slice(0,10).map((x,i) => `<div class="scorer-list-row" onclick="openPlayerProfile('${x.p.id}')">
      <div class="scorer-list-player"><span class="scorer-rank">${i===0?'🥇':String(i+1).padStart(2,'0')}</span>${scorerAvatar(x.p)}<span class="scorer-list-name">${x.p.name}<small>${x.goalPj} PJ con planilla</small></span></div>
      <div class="scorer-list-goals"><b>${x.goals}</b><span>G</span></div>
      <div class="scorer-list-gpp"><b>${goalsPerGame(x).toFixed(2)}</b><span>G/PJ</span></div>
      <div class="scorer-list-share"><div class="scorer-list-track"><i style="width:${Math.round(x.goals/max*100)}%"></i></div><span>${Math.round(x.goals / Math.max(1,goles) * 100)}%</span></div>
    </div>`).join('')}</div>
    <p class="sec-note scorers-note">Datos desde que se registra la planilla de goles${trackingStart ? ` (${trackingStart})` : ''}. El promedio exige al menos ${minGpp} PJ registrados; los partidos históricos sin planilla no afectan esta métrica.</p>
    ${extras.length ? `<div class="scorers-extras">${extras.join('<br>')}</div>` : ''}
  </section>`;
}

// --- 3. Datos del ciclo (récords) ---
function factsHTML(ms, players) {
  const facts = [];
  const elig3 = players.filter(x => x.pj >= 3);

  const byStreak = players.map(x => ({ x, v: getMaxWinStreak(x.p.id, ms) })).sort((a,b)=>b.v-a.v)[0];
  if (byStreak && byStreak.v >= 2) facts.push(['🔥','Mejor racha ganadora', `${byStreak.x.p.name} — ${byStreak.v} victorias seguidas`]);

  const byUnbeaten = players.map(x => ({ x, v: getMaxUnbeatenStreak(x.p.id, ms) })).sort((a,b)=>b.v-a.v)[0];
  if (byUnbeaten && byUnbeaten.v >= 3) facts.push(['🛡️','Más tiempo invicto', `${byUnbeaten.x.p.name} — ${byUnbeaten.v} partidos sin perder`]);

  const byBad = players.map(x => ({ x, v: getMaxLossStreak(x.p.id, ms) })).sort((a,b)=>b.v-a.v)[0];
  if (byBad && byBad.v >= 2) facts.push(['🧊','Peor racha', `${byBad.x.p.name} — ${byBad.v} derrotas seguidas`]);

  const enRacha = players.map(x => ({ x, f: getPlayerForm(x.p.id, ms) })).filter(o => o.f.type === 'V' && o.f.streak >= 2).sort((a,b)=>b.f.streak-a.f.streak)[0];
  if (enRacha) facts.push(['🚀','En llamas ahora', `${enRacha.x.p.name} — ${enRacha.f.streak} victorias al hilo`]);

  const byMvp = pickTop(players.filter(x=>x.mvps>0), (a,b)=>b.mvps-a.mvps);
  if (byMvp) facts.push(['⭐','El más MVP', `${byMvp.p.name} — ${byMvp.mvps} vez${byMvp.mvps===1?'':'es'}`]);

  const byWr = pickTop(elig3, (a,b)=>b.wr-a.wr);
  if (byWr) facts.push(['📈','Mejor % de victorias', `${byWr.p.name} — ${pct(byWr.wr)} (mín. 3 PJ)`]);

  const byPpp = pickTop(elig3, (a,b)=>b.ppp-a.ppp);
  if (byPpp) facts.push(['🧲','Talismán del grupo', `${byPpp.p.name} — ${byPpp.ppp.toFixed(2)} pts por partido`]);

  const byWorst = pickTop(elig3, (a,b)=>a.ppp-b.ppp);
  if (byWorst && elig3.length > 2) facts.push(['🐐','Mufa oficial', `${byWorst.p.name} — ${byWorst.ppp.toFixed(2)} pts por partido`]);

  const byRouts = pickTop(players.filter(x=>x.routs>0), (a,b)=>b.routs-a.routs);
  if (byRouts) facts.push(['💥','Especialista en goleadas', `${byRouts.p.name} — ${byRouts.routs} goleada${byRouts.routs===1?'':'s'} ganada${byRouts.routs===1?'':'s'}`]);

  const byDraws = pickTop(players.filter(x=>x.d>=2), (a,b)=>b.d-a.d);
  if (byDraws) facts.push(['🤝','Rey del empate', `${byDraws.p.name} — ${byDraws.d} empates`]);

  const byPj = pickTop(players, (a,b)=>b.pj-a.pj);
  if (byPj) facts.push(['🎮','El más presente', `${byPj.p.name} — ${byPj.pj} de ${ms.length} partidos (${pct(byPj.pj/ms.length)})`]);

  if (ms.length >= 4) {
    const byAusente = pickTop(players, (a,b)=>a.pj-b.pj);
    if (byAusente && byAusente.pj < ms.length) facts.push(['👻','El más escurridizo', `${byAusente.p.name} — solo ${byAusente.pj} de ${ms.length} partidos`]);
  }

  const goleador = pickTop(players.filter(x=>x.goals>0), (a,b)=>b.goals-a.goals);
  if (goleador) facts.push(['🥇','Botín de oro', `${goleador.p.name} — ${goleador.goals} gol${goleador.goals===1?'':'es'}`]);

  const minGpp = goalAverageMinimum(ms);
  const promGol = pickTop(players.filter(x=>x.goals>0 && x.goalPj>=minGpp), (a,b)=>goalsPerGame(b)-goalsPerGame(a));
  if (promGol) facts.push(['🎯','Mejor promedio de gol', `${promGol.p.name} — ${goalsPerGame(promGol).toFixed(2)} por partido (mín. ${minGpp} PJ registrados)`]);

  const paters = getPaternidades(ms);
  if (paters.length) {
    const porPadre = {}, porHijo = {};
    paters.forEach(d => { porPadre[d.padre] = (porPadre[d.padre]||0)+1; porHijo[d.hijo] = (porHijo[d.hijo]||0)+1; });
    const rey = Object.entries(porPadre).sort((a,b)=>b[1]-a[1])[0];
    const bebe = Object.entries(porHijo).sort((a,b)=>b[1]-a[1])[0];
    if (rey) facts.push(['👑','Padre de familia', `${playerNameById(rey[0])} — ${rey[1]} hijo${rey[1]===1?'':'s'} en el grupo`]);
    if (bebe) facts.push(['🍼','El bebé del grupo', `${playerNameById(bebe[0])} — lo tienen de hijo ${bebe[1]} jugador${bebe[1]===1?'':'es'}`]);
    const top = paters[0];
    facts.push(['👶','Paternidad más marcada', `${playerNameById(top.padre)} le gana ${top.pw} a ${top.hw} a ${playerNameById(top.hijo)}`]);
  }

  // Rendimiento vs cotización (OVR normalizado contra pts por partido)
  if (elig3.length >= 3) {
    const ovrs = elig3.map(x=>x.ovr);
    const minO = Math.min(...ovrs), maxO = Math.max(...ovrs);
    const spread = elig3.map(x => ({
      x,
      diff: (x.ppp/3) - (maxO === minO ? .5 : (x.ovr-minO)/(maxO-minO))
    })).sort((a,b)=>b.diff-a.diff);
    const joya = spread[0], humo = spread[spread.length-1];
    if (joya && joya.diff > 0.12) facts.push(['💎','Rinde más de lo que cotiza', `${joya.x.p.name} — OVR ${joya.x.ovr} pero ${joya.x.ppp.toFixed(2)} pts/partido`]);
    if (humo && humo.diff < -0.12) facts.push(['💸','Cotización inflada', `${humo.x.p.name} — OVR ${humo.x.ovr} y solo ${humo.x.ppp.toFixed(2)} pts/partido`]);
  }

  if (!facts.length) return '';
  return `<div class="admin-section">
    <h3>🏆 Datos del ciclo</h3>
    ${facts.map(([e,l,v]) => `
      <div class="fact-row">
        <span class="fact-emoji">${e}</span>
        <div style="flex:1;min-width:0">
          <div class="fact-label">${l}</div>
          <div class="fact-val">${v}</div>
        </div>
      </div>`).join('')}
  </div>`;
}

// --- 4. Tabla de rendimiento ---
function rendimientoHTML(ms, players) {
  const rows = players.slice().sort((a,b) => b.ppp - a.ppp || b.pj - a.pj);
  const hayGoles = players.some(x => x.goals > 0);
  return `<div class="admin-section">
    <h3>📋 Rendimiento vs cotización</h3>
    <p class="sec-note">Ordenado por puntos por partido. El OVR viene de los votos; los puntos, de la cancha.</p>
    <table class="mini-table">
      <thead><tr>
        <th>Jugador</th><th>PJ</th><th>%V</th><th>Pts/PJ</th>${hayGoles?'<th>⚽</th>':''}<th>⭐</th><th>OVR</th>
      </tr></thead>
      <tbody>
      ${rows.map(x => `<tr onclick="openPlayerProfile('${x.p.id}')">
        <td>${x.p.name}</td>
        <td>${x.pj}</td>
        <td style="color:${x.wr>=.6?'var(--green)':x.wr>=.4?'var(--gold)':'var(--red)'}">${pct(x.wr)}</td>
        <td style="font-family:'Bebas Neue',sans-serif;font-size:16px">${x.ppp.toFixed(2)}</td>
        ${hayGoles?`<td style="color:${x.goals?'var(--green)':'var(--muted)'}">${x.goals||'-'}</td>`:''}
        <td style="color:${x.mvps?'var(--gold)':'var(--muted)'}">${x.mvps||'-'}</td>
        <td style="color:var(--muted)">${x.ovr}</td>
      </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// --- 5. Duplas ---
function duplasHTML(ms) {
  const { together } = getPairStats(ms);
  const all = Object.entries(together).map(([key, v]) => {
    const [a, b] = key.split('|');
    const pj = v.w + v.d + v.l;
    return { a, b, ...v, pj, wr: pj ? v.w/pj : 0 };
  }).filter(d => d.pj >= 2);

  if (!all.length) return '';

  const mejores = all.slice().sort((x,y) => y.wr - x.wr || y.pj - x.pj).slice(0, 5);
  const peores = all.slice().sort((x,y) => x.wr - y.wr || y.pj - x.pj).slice(0, 3).filter(d => d.wr < 0.5);
  const masJuntos = all.slice().sort((x,y) => y.pj - x.pj).slice(0, 3);

  const row = (d, i, medal) => `
    <div class="duo-row">
      <span class="duo-rank">${medal && i===0 ? medal : i+1}</span>
      <span class="duo-names">${playerNameById(d.a)} + ${playerNameById(d.b)}</span>
      <span class="duo-rec">${d.w}V ${d.d}E ${d.l}D</span>
      <span class="duo-pct" style="color:${d.wr>=.6?'var(--green)':d.wr>=.4?'var(--gold)':'var(--red)'}">${pct(d.wr)}</span>
    </div>`;

  return `<div class="admin-section">
    <h3>🤝 Duplas de oro</h3>
    <p class="sec-note">Rendimiento jugando en el mismo equipo (mín. 2 partidos juntos)</p>
    ${mejores.map((d,i) => row(d,i,'🥇')).join('')}
    ${peores.length ? `
      <h3 style="margin-top:18px">💀 Duplas malditas</h3>
      <p class="sec-note">Los que juntos no la pasan bien</p>
      ${peores.map((d,i) => row(d,i,'')).join('')}` : ''}
    <h3 style="margin-top:18px">👯 Los inseparables</h3>
    <p class="sec-note">Los que más veces cayeron en el mismo equipo</p>
    ${masJuntos.map(d => `
      <div class="duo-row">
        <span class="duo-rank">🔗</span>
        <span class="duo-names">${playerNameById(d.a)} + ${playerNameById(d.b)}</span>
        <span class="duo-pct" style="color:var(--gold)">${d.pj}</span>
      </div>`).join('')}
  </div>`;
}

// --- 6. Paternidades 👶 ---
function babySVG(size, cls) {
  return `<svg class="${cls||'baby'}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M28.5 12.5q3.5-6 7.5-1.5" stroke="#7a4a22" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <circle cx="32" cy="33" r="19" fill="#f3c9a2"/>
    <circle cx="13.5" cy="33" r="3.6" fill="#eab88f"/>
    <circle cx="50.5" cy="33" r="3.6" fill="#eab88f"/>
    <circle cx="25" cy="29.5" r="2.5" fill="#25180d"/>
    <circle cx="39" cy="29.5" r="2.5" fill="#25180d"/>
    <circle cx="25.9" cy="28.7" r=".8" fill="#fff"/>
    <circle cx="39.9" cy="28.7" r=".8" fill="#fff"/>
    <ellipse cx="20" cy="37" rx="3.4" ry="2.5" fill="#e88b8b" opacity=".6"/>
    <ellipse cx="44" cy="37" rx="3.4" ry="2.5" fill="#e88b8b" opacity=".6"/>
    <ellipse cx="32" cy="43" rx="7.5" ry="5.2" fill="#f0c040" stroke="#a8761d" stroke-width="1.4"/>
    <circle cx="32" cy="43" r="3" fill="#fff6dd" stroke="#a8761d" stroke-width="1.2"/>
  </svg>`;
}

function paternidadNivel(diff) {
  if (diff >= 5) return 'Le pasa la cuota alimentaria';
  if (diff >= 4) return 'Paternidad con DNI firmado';
  if (diff >= 3) return 'Paternidad confirmada';
  return 'Paternidad';
}

// Cruces directos donde uno le saca ventaja clara al otro
function getPaternidades(ms, minGames, minDiff) {
  const { against } = getPairStats(ms);
  const min = minGames || 3, dmin = minDiff || 2;
  return Object.entries(against).map(([key, v]) => {
    const [a, b] = key.split('|');
    const aw = v.wins[a] || 0, bw = v.wins[b] || 0;
    const diff = Math.abs(aw - bw);
    return { a, b, aw, bw, diff, games: v.games, draws: v.draws,
             padre: aw > bw ? a : b, hijo: aw > bw ? b : a,
             pw: Math.max(aw, bw), hw: Math.min(aw, bw) };
  })
  .filter(d => d.games >= min && d.diff >= dmin)
  .sort((x, y) => y.diff - x.diff || y.pw - x.pw || y.games - x.games);
}

function paternidadesHTML(ms) {
  const paters = getPaternidades(ms);
  if (!paters.length) {
    return `<div class="admin-section pater-card">
      <h3>👶 Paternidades</h3>
      ${babySVG(160, 'baby pater-watermark')}
      <p class="sec-note" style="position:relative;z-index:1">Por ahora nadie tiene hijos: hacen falta al menos 3 cruces directos y 2 victorias de ventaja. Todos limpios… por ahora.</p>
    </div>`;
  }

  const hijosPorPadre = {};
  paters.forEach(d => { hijosPorPadre[d.padre] = (hijosPorPadre[d.padre] || 0) + 1; });
  const reyes = Object.entries(hijosPorPadre).sort((a,b) => b[1]-a[1]).slice(0, 4);

  return `<div class="admin-section pater-card">
    <h3>👶 Paternidades</h3>
    ${babySVG(160, 'baby pater-watermark')}
    <p class="sec-note" style="position:relative;z-index:1">Cara a cara en equipos distintos: mínimo 3 cruces y 2 victorias de ventaja para la patria potestad.</p>
    ${paters.slice(0, 8).map(d => `
      <div class="pater-row">
        ${babySVG(40)}
        <div style="flex:1;min-width:0">
          <div class="pater-tag">${paternidadNivel(d.diff)}</div>
          <div class="fact-val"><b style="color:var(--green)">${playerNameById(d.padre)}</b> tiene de hijo a <b>${playerNameById(d.hijo)}</b> 🍼</div>
          <div class="pater-detail">${d.games} cruce${d.games===1?'':'s'}${d.draws?` · ${d.draws} empate${d.draws===1?'':'s'}`:''}</div>
        </div>
        <span class="pater-score">${d.pw}–${d.hw}</span>
      </div>`).join('')}
    <div class="pater-kings">
      ${reyes.map(([id, n], i) => `<span class="chip" style="${i===0?'color:var(--gold);border-color:rgba(240,192,64,.45)':''}">${i===0?'👑':'👨‍👦'} ${playerNameById(id)} · ${n} hijo${n===1?'':'s'}</span>`).join('')}
    </div>
  </div>`;
}

// --- 7. Rivalidades ---
function rivalidadesHTML(ms) {
  const { against } = getPairStats(ms);
  const all = Object.entries(against).map(([key, v]) => {
    const [a, b] = key.split('|');
    const aw = v.wins[a] || 0, bw = v.wins[b] || 0;
    return { a, b, aw, bw, draws: v.draws, games: v.games, diff: Math.abs(aw - bw) };
  }).filter(r => r.games >= 2);

  if (!all.length) return '';

  const clasicos = all.slice().sort((x,y) => y.games - x.games || y.diff - x.diff).slice(0, 5);
  const pareja = all.filter(r => r.games >= 3).sort((x,y) => x.diff - y.diff || y.games - x.games)[0];

  const cross = r => {
    const domA = r.aw > r.bw, domB = r.bw > r.aw;
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="flex:1;text-align:right;font-weight:${domA?'700':'500'};font-size:13.5px;color:${domA?'var(--green)':'var(--text)'}">${playerNameById(r.a)}</span>
        <span style="font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:2px;background:var(--bg3);border-radius:8px;padding:2px 10px;white-space:nowrap">${r.aw} – ${r.bw}</span>
        <span style="flex:1;font-weight:${domB?'700':'500'};font-size:13.5px;color:${domB?'var(--green)':'var(--text)'}">${playerNameById(r.b)}</span>
      </div>
      <div style="text-align:center;font-size:10px;color:var(--muted);margin-top:3px">${r.games} cruce${r.games===1?'':'s'}${r.draws?` · ${r.draws} empate${r.draws===1?'':'s'}`:''}</div>
    </div>`;
  };

  return `<div class="admin-section">
    <h3>⚔️ Los clásicos</h3>
    <p class="sec-note">Los que más veces se cruzaron de veredas opuestas</p>
    ${clasicos.map(cross).join('')}
    ${pareja ? `
      <h3 style="margin-top:18px">⚖️ La más pareja</h3>
      ${cross(pareja)}` : ''}
  </div>`;
}

// --- 8. Presentismo ---
function presentismoHTML(ms, players) {
  const rows = players.slice().sort((a,b) => b.pj - a.pj);
  const total = ms.length;
  return `<div class="admin-section">
    <h3>🎯 Presentismo</h3>
    <p class="sec-note">Partidos jugados sobre los ${total} del período</p>
    ${rows.map(x => `
      <div class="bar-row" onclick="openPlayerProfile('${x.p.id}')" style="cursor:pointer">
        <span class="bar-name">${x.p.name}</span>
        <div class="bar-track"><div class="bar-fill blue" style="width:${Math.round(x.pj/total*100)}%"></div></div>
        <span class="bar-val" style="color:#60a5fa">${x.pj}/${total}</span>
      </div>`).join('')}
  </div>`;
}

// --- 9. Sala de votación ---
function votacionHTML() {
  const { biases } = computeVoterBiases();
  const conBias = Object.entries(biases).filter(([,b]) => Math.abs(b) > 0.05);
  const rows = [];

  if (conBias.length) {
    const gen = conBias.slice().sort((a,b)=>b[1]-a[1])[0];
    const sev = conBias.slice().sort((a,b)=>a[1]-b[1])[0];
    if (gen && gen[1] > 0.15) rows.push(['🫶','Mano abierta', `${playerNameById(gen[0])} — vota ${gen[1].toFixed(2)} arriba del promedio`]);
    if (sev && sev[1] < -0.15) rows.push(['🧱','Mano dura', `${playerNameById(sev[0])} — vota ${Math.abs(sev[1]).toFixed(2)} abajo del promedio`]);
  }

  const votos = state.players.map(p => ({ p, n: getValidRatings(p).length })).filter(x => x.n > 0);
  if (votos.length) {
    const masVotado = votos.slice().sort((a,b)=>b.n-a.n)[0];
    rows.push(['🗳️','El más votado', `${masVotado.p.name} — ${masVotado.n} votos recibidos`]);
    const menosVotado = votos.slice().sort((a,b)=>a.n-b.n)[0];
    if (menosVotado.n < masVotado.n) rows.push(['🕵️','El menos votado', `${menosVotado.p.name} — ${menosVotado.n} voto${menosVotado.n===1?'':'s'} recibido${menosVotado.n===1?'':'s'}`]);
  }

  const autos = state.players
    .filter(p => hasSelfRating(p) && getOverall(p))
    .map(p => ({ p, diff: (getSelfOverall(p)||0) - (getOverall(p)||0) }));
  if (autos.length) {
    const ego = autos.slice().sort((a,b)=>b.diff-a.diff)[0];
    if (ego.diff > 3) rows.push(['🪞','Se ve mejor de lo que el grupo lo ve', `${ego.p.name} — se pone ${ego.diff} puntos más`]);
    const humilde = autos.slice().sort((a,b)=>a.diff-b.diff)[0];
    if (humilde.diff < -3) rows.push(['😇','El más humilde', `${humilde.p.name} — se pone ${Math.abs(humilde.diff)} puntos menos`]);
  }

  if (!rows.length) return '';
  return `<div class="admin-section">
    <h3>🗳️ Sala de votación</h3>
    <p class="sec-note">Cómo vota y cómo es votado cada uno (no depende del período)</p>
    ${rows.map(([e,l,v]) => `
      <div class="fact-row">
        <span class="fact-emoji">${e}</span>
        <div style="flex:1;min-width:0">
          <div class="fact-label">${l}</div>
          <div class="fact-val">${v}</div>
        </div>
      </div>`).join('')}
  </div>`;
}

// ============================================================
