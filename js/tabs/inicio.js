// MATCHDAY CENTRAL — portada operativa del club
// ============================================================
function hubTeamPlayers(m, index) {
  return ((((m.teams || [])[index] || {}).players) || []).slice(0, 3).map(p => p.name).join(' · ') || 'Plantel por confirmar';
}

function hubResultText(m) {
  if (!m || !m.result) return 'Partido pendiente';
  if (m.result.winner === 'draw') return 'Empate';
  const ti = Number(m.result.winner);
  return `Ganó Equipo ${TEAM_NAMES[ti] || ti + 1}`;
}

// PODIO — carta destacada por categoría. Reutiliza el tier de la carta FIFA.
function hubPodiumCard(label, item, value, unit, second, secondUnit, badge) {
  if (!item) {
    return `<article class="podium-card is-empty">
      <div class="podium-label">${label}</div>
      <div class="podium-portrait is-placeholder">⚽</div>
      <div class="podium-name">Sin datos</div>
      <div class="podium-figures"><div><b>—</b><span>${unit}</span></div></div>
    </article>`;
  }
  const p = item.p;
  const tier = getCardTier(item.ovr || 60);
  const photo = safePhotoUrl(p.photo);
  const portrait = photo
    ? `<div class="podium-portrait"><img src="${escapeHtml(photo)}" alt="${escapeHtml(p.name)}"></div>`
    : `<div class="podium-portrait is-placeholder" aria-hidden="true">⚽</div>`;
  const secondHTML = second !== undefined && second !== null
    ? `<div><b>${second}</b><span>${secondUnit}</span></div>` : '';
  return `<article class="podium-card tier-${tier.cls}${badge ? ' is-hero' : ''}" onclick="openPlayerProfile('${p.id}')">
    <div class="podium-label">${label}</div>
    ${portrait}
    <div class="podium-name">${escapeHtml(p.name)}</div>
    <div class="podium-figures"><div><b>${value}</b><span>${unit}</span></div>${secondHTML}</div>
    ${badge ? `<div class="podium-badge">${badge}</div>` : ''}
  </article>`;
}

// Tabla de goleadores del club (top 5)
function hubScorersHTML(rows) {
  const top = rows.filter(x => x.rec.goals > 0)
    .sort((a,b) => b.rec.goals - a.rec.goals || a.p.name.localeCompare(b.p.name))
    .slice(0, 5);
  if (!top.length) return `<div class="hub-empty-result">Todavía no hay goles cargados. Anotalos desde la planilla y el ranking se arma solo.</div>`;
  return `<div class="scoreboard-table">
    <div class="scoreboard-head"><span>Jugador</span><span>PJ</span><span>Goles</span><span>G/PJ</span></div>
    ${top.map((x,i) => `<div class="scoreboard-row" onclick="openPlayerProfile('${x.p.id}')">
      <span class="scoreboard-player"><i class="scoreboard-pos">${i+1}</i>${escapeHtml(x.p.name)}</span>
      <span>${x.rec.goalPj || 0}</span>
      <span class="scoreboard-goals">${x.rec.goals}</span>
      <span>${x.rec.goalPj ? (x.rec.goals / x.rec.goalPj).toFixed(1) : '—'}</span>
    </div>`).join('')}
  </div>`;
}

// Última actividad — goles de los partidos más recientes
function hubActivityHTML(played) {
  const events = [];
  for (const m of played) {
    if (!hasGoalsTracking(m)) continue;
    for (const s of matchScorers(m)) {
      events.push({ name: s.name, goals: s.goals, date: hubDateISO(m), id: m.id });
      if (events.length >= 8) break;
    }
    if (events.length >= 8) break;
  }
  if (!events.length) return `<div class="hub-empty-result">Sin actividad reciente.</div>`;
  return `<div class="activity-feed">${events.map(e => `<div class="activity-row">
    <span class="activity-dot"></span>
    <div class="activity-copy"><b>${escapeHtml(e.name)}</b><span>${e.goals} ${e.goals === 1 ? 'gol' : 'goles'}</span></div>
    <span class="activity-date">${e.date ? e.date.slice(5).split('-').reverse().join('/') : ''}</span>
  </div>`).join('')}</div>`;
}

function hubLeaderRow(icon, label, item, value, meta) {
  const name = item?.p?.name || 'A definir';
  return `<div class="hub-leader">
    <div class="hub-leader-icon">${icon}</div>
    <div class="hub-leader-copy"><div class="hub-leader-label">${label}</div><div class="hub-leader-name">${name}</div></div>
    <div><div class="hub-leader-value">${value}</div><div class="hub-leader-meta">${meta}</div></div>
  </div>`;
}

function hubDateISO(m) {
  return m?.match_date || (m?.created_at || '').slice(0,10);
}

function hubTodayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,10);
}

function hubOpenMatch() {
  const today = hubTodayISO();
  return matches.filter(m => !isPlayed(m)).slice().sort((a,b) => {
    const da = hubDateISO(a), db = hubDateISO(b);
    const aPast = da && da < today ? 1 : 0;
    const bPast = db && db < today ? 1 : 0;
    return aPast - bPast || da.localeCompare(db) || (a.created_at || '').localeCompare(b.created_at || '');
  })[0] || null;
}

function hubFixturePlayerHTML(matchPlayer) {
  const current = state.players.find(p => p.id === matchPlayer.id);
  const source = current || matchPlayer;
  const pos = matchPlayer.pos || matchPlayer.effPos || getEffectivePosition(source) || 'MED';
  const ovr = matchPlayer.ovr || getOverall(source) || 60;
  const record = matchPlayer.isGuest ? null : getPlayerRecord(matchPlayer.id);
  const photo = current?.photo || matchPlayer.photo;
  const avatar = photo
    ? `<img class="fixture-avatar" src="${photo}" alt="">`
    : `<div class="fixture-avatar fixture-avatar-ph">${posEmoji(pos) || '👤'}</div>`;
  const metrics = record
    ? `<div class="fixture-player-metrics"><span class="fixture-player-metric"><b>${ovr}</b>OVR</span><span class="fixture-player-metric"><b>${record.pj}</b>PJ</span><span class="fixture-player-metric goal"><b>${record.goalPj ? (record.goals / record.goalPj).toFixed(2) : '—'}</b>G/P</span></div>`
    : `<span class="fixture-player-guest">INVITADO</span>`;
  return `<div class="fixture-player">${avatar}<div style="min-width:0"><div class="fixture-player-name">${matchPlayer.name}</div><div class="fixture-player-pos">${POS_LABELS[pos] || pos}</div></div>${metrics}</div>`;
}

function hubFixtureTeamHTML(m, team, index) {
  const players = team.players || [];
  const rated = players.map(p => ({ p, ovr: p.ovr || getOverall(state.players.find(x => x.id === p.id) || p) || 60 }));
  const avgOvr = rated.length ? Math.round(rated.reduce((sum, x) => sum + x.ovr, 0) / rated.length) : '—';
  const figure = rated.slice().sort((a,b) => b.ovr - a.ovr || a.p.name.localeCompare(b.p.name))[0];
  return `<section class="fixture-team"><div class="fixture-team-head"><div class="fixture-team-name">${TEAM_EMOJIS[index] || '⚪'} Equipo ${TEAM_NAMES[index] || index + 1}</div><div class="fixture-ovr">OVR ${avgOvr}</div></div><div class="fixture-figure"><span>⭐ FIGURA</span><b>${figure ? `${figure.p.name} · ${figure.ovr}` : 'Plantel por confirmar'}</b></div><div class="fixture-players">${players.length ? players.map(hubFixturePlayerHTML).join('') : '<div class="text-muted" style="padding:8px">Sin jugadores asignados</div>'}</div></section>`;
}

function hubFixtureHTML(m) {
  const teams = m.teams || [];
  const isLive = matchHasGoals(m);
  const today = hubDateISO(m) === hubTodayISO();
  const date = today ? 'HOY' : formatMatchDate(m);
  const status = isLive ? `EN JUEGO · ${matchScoreStr(m)}` : 'EQUIPOS CONFIRMADOS';
  return `<section class="hub-fixture"><div class="fixture-head"><div><div class="fixture-kicker"><i></i> JORNADA DEL CLUB</div><div class="fixture-title">PARTIDO CONFIRMADO</div></div><div class="fixture-head-right"><span class="fixture-date">📅 ${date}</span><span class="fixture-status${isLive ? ' live' : ''}">${status}</span></div></div><div class="fixture-team-grid teams-${teams.length}">${teams.map((team, index) => hubFixtureTeamHTML(m, team, index)).join('')}</div><div class="fixture-footer"><div class="fixture-footer-copy"><strong>${teams.reduce((n, t) => n + (t.players || []).length, 0)} convocados</strong> · estadísticas de temporada de cada formación</div><button class="btn btn-primary btn-sm" onclick="openGolesFor('${m.id}')">${isLive ? '⚽ Seguir partido' : '⚽ Abrir planilla'}</button></div></section>`;
}

function renderHub() {
  const root = document.getElementById('hub-content');
  if (!root) return;

  if (state.currentUser?.supportMode) {
    const going = state.players.filter(p => p.attendance === 'going').length;
    const pending = state.players.filter(p => !p.attendance).length;
    const openMatches = matches.filter(m => !isPlayed(m)).length;
    root.innerHTML = `<div class="hub-shell"><section class="hub-hero"><div class="hub-hero-copy"><div><div class="hub-kicker"><span class="hub-live-dot"></span> SOPORTE MAESTRO · ACCESO VERIFICADO</div><h1>GESTIONANDO<br><strong>${escapeHtml(state.currentClub.name.toUpperCase())}</strong></h1><p>Administrá el plantel y los partidos sin mezclar tu perfil con el de este club.</p></div><div class="hub-hero-actions"><button class="btn btn-primary btn-sm" onclick="switchTab('admin')">⚙️ Administrar club</button><button class="btn btn-ghost btn-sm" onclick="openPlatformAdmin()">🛡️ Cambiar club</button></div></div><aside class="hub-attendance"><div class="hub-panel-label">ESTADO DEL CLUB</div><div class="hub-attendance-meter"><div class="going"><b>${going}</b><span>Van</span></div><div><b>${pending}</b><span>Faltan</span></div><div><b>${openMatches}</b><span>Abiertos</span></div></div><div class="hub-attendance-copy" style="margin-top:14px">Las votaciones son personales y se mantienen fuera del modo soporte.</div></aside></section></div>`;
    return;
  }

  const me = getMe() || state.currentUser;
  const going = state.players.filter(p => p.attendance === 'going').length;
  const notgoing = state.players.filter(p => p.attendance === 'notgoing').length;
  const pending = Math.max(0, state.players.length - going - notgoing);
  const attendance = me?.attendance || null;
  const attendanceState = attendance === 'going' ? 'ESTÁS ADENTRO' : attendance === 'notgoing' ? 'ESTA VEZ NO VAS' : '¿JUGÁS ESTE SÁBADO?';
  const attendanceCopy = attendance === 'going'
    ? 'Perfecto. Ya te contamos para armar los equipos.'
    : attendance === 'notgoing'
      ? 'Si cambiás de idea, podés volver a marcar que vas.'
      : 'Confirmá tu lugar para que el plantel se organice a tiempo.';

  const played = matches.filter(isPlayed).slice().sort((a,b) =>
    `${b.match_date || ''}${b.created_at || ''}`.localeCompare(`${a.match_date || ''}${a.created_at || ''}`)
  );
  const latest = played[0] || null;
  const openMatch = hubOpenMatch();
  const rows = state.players.map(p => ({ p, rec: getPlayerRecord(p.id), ovr: getOverall(p) || 60 }));
  const hubMinGpp = goalAverageMinimum(played);
  const byGoals = rows.slice().filter(x => x.rec.goals > 0).sort((a,b) => b.rec.goals - a.rec.goals || a.p.name.localeCompare(b.p.name))[0];
  const byAverage = rows.slice().filter(x => x.rec.goalPj >= hubMinGpp && x.rec.goals > 0).sort((a,b) => (b.rec.goals / b.rec.goalPj) - (a.rec.goals / a.rec.goalPj) || b.rec.goals - a.rec.goals)[0];
  const byGames = rows.slice().filter(x => x.rec.pj > 0).sort((a,b) => b.rec.pj - a.rec.pj || b.rec.pts - a.rec.pts)[0];
  const byOverall = rows.slice().sort((a,b) => b.ovr - a.ovr || a.p.name.localeCompare(b.p.name))[0];
  const greeting = (me?.name || 'equipo').split(' ')[0];

  let lastMatchHTML = `<div class="hub-empty-result">Todavía no hay un resultado cerrado. Cuando se juegue el primero, este espacio va a guardar la historia del club.</div>`;
  if (latest) {
    const teams = latest.teams || [];
    const scores = matchScore(latest);
    const mvp = latest.result?.mvp ? matchPlayerName(latest, latest.result.mvp) : null;
    const scorers = matchScorers(latest).slice(0, 3);
    const scoreVisual = teams.length === 3
      ? `<div class="hub-last-match hub-last-match-three">${teams.map((team, i) => `<div class="hub-team"><div class="hub-team-name">${TEAM_EMOJIS[i] || '⚪'} Equipo ${TEAM_NAMES[i] || i + 1}</div><div class="hub-score-single">${scores[i] || 0}</div><div class="hub-team-sub">${hubTeamPlayers(latest, i)}</div></div>`).join('')}</div>`
      : `<div class="hub-last-match"><div class="hub-team"><div class="hub-team-name">${TEAM_EMOJIS[0] || '⚪'} Equipo ${TEAM_NAMES[0] || 1}</div><div class="hub-team-sub">${hubTeamPlayers(latest, 0)}</div></div><div class="hub-score-wrap"><div class="hub-score">${matchHasGoals(latest) ? matchScoreStr(latest) : '—'}</div><div class="hub-result">${hubResultText(latest)}</div></div><div class="hub-team"><div class="hub-team-name">Equipo ${TEAM_NAMES[1] || 2} ${TEAM_EMOJIS[1] || '⚪'}</div><div class="hub-team-sub">${hubTeamPlayers(latest, 1)}</div></div></div>`;
    const meta = [`<span class="hub-meta-chip">📅 <strong>${formatMatchDate(latest)}</strong></span>`];
    if (mvp) meta.push(`<span class="hub-meta-chip">⭐ MVP <strong>${mvp}</strong></span>`);
    if (scorers.length) meta.push(`<span class="hub-meta-chip">⚽ ${scorers.map(s => `${s.name} ${s.goals}`).join(' · ')}</span>`);
    lastMatchHTML = `${scoreVisual}<div class="hub-match-meta">${meta.join('')}<div class="hub-match-actions"><button class="hub-mini-btn" onclick="switchTab('partidos')">Ver historial</button><button class="hub-mini-btn" onclick="shareMatchResult('${latest.id}')">Compartir</button></div></div>`;
  }

  const fixtureHTML = openMatch ? hubFixtureHTML(openMatch) : '';
  const fallbackValue = '—';
  const quickThird = state.currentUser?.isAdmin
    ? `<button class="hub-quick" onclick="switchTab('equipos')"><div class="hub-quick-icon">🏆</div><div><b>Armar equipos</b><span>Equilibrar el próximo partido</span></div></button>`
    : `<button class="hub-quick" onclick="openEditProfile()"><div class="hub-quick-icon">🪪</div><div><b>Mi carta</b><span>Editar foto y posición</span></div></button>`;

  root.innerHTML = `<div class="hub-shell">
    <section class="hub-hero">
      <div class="hub-hero-copy"><div><div class="hub-kicker"><span class="hub-live-dot"></span> MATCHDAY CENTRAL · CLUB DEL SÁBADO</div><h1>TODO EL FULBITO,<br><strong>EN UNA MIRADA.</strong></h1><p>Buenas, ${greeting}. Tu central para confirmar, competir y seguir la historia de cada sábado.</p></div><div class="hub-hero-actions"><button class="btn btn-primary btn-sm" onclick="switchTab('asistencia')">✅ Ver asistencia</button><button class="btn btn-ghost btn-sm" onclick="switchTab('partidos')">📜 Temporada</button></div></div>
      <aside class="hub-attendance"><div class="hub-attendance-top"><div><div class="hub-panel-label">TU DISPONIBILIDAD</div><div class="hub-attendance-state ${attendance ? `is-${attendance}` : ''}">${attendanceState}</div><div class="hub-attendance-copy">${attendanceCopy}</div></div><div style="font-size:22px">${attendance === 'going' ? '✅' : attendance === 'notgoing' ? '❌' : '⚽'}</div></div><div class="hub-choice-row"><button class="hub-choice going${attendance === 'going' ? ' active' : ''}" onclick="setAttendance('${me?.id || ''}','going')">✅ VOY</button><button class="hub-choice notgoing${attendance === 'notgoing' ? ' active' : ''}" onclick="setAttendance('${me?.id || ''}','notgoing')">❌ NO VOY</button></div><div class="hub-attendance-meter"><div class="going"><b>${going}</b><span>Van</span></div><div class="no"><b>${notgoing}</b><span>No van</span></div><div><b>${pending}</b><span>Faltan</span></div></div></aside>
    </section>
    ${fixtureHTML}
    <section class="hub-panel hub-lastmatch-panel"><div class="hub-panel-head"><div><div class="hub-panel-kicker">ARCHIVO DEL CLUB</div><div class="hub-panel-title">ÚLTIMO PARTIDO</div></div><span class="chip">${played.length} jugado${played.length === 1 ? '' : 's'}</span></div>${lastMatchHTML}</section>

    <section class="podium-section">
      <div class="hub-panel-head"><div><div class="hub-panel-kicker">FORMA ACTUAL</div><div class="hub-panel-title">PODIO DEL CLUB</div></div><button class="hub-mini-btn" onclick="switchTab('partidos')">Stats ↗</button></div>
      <div class="podium-rail" id="podium-rail">
        ${hubPodiumCard('OVR DEL CLUB', byOverall, byOverall ? byOverall.ovr : '—', 'OVR', byOverall ? (POS_LABELS[getEffectivePosition(byOverall.p)] || getEffectivePosition(byOverall.p)) : null, 'Puesto')}
        ${hubPodiumCard('MEJOR PROMEDIO', byAverage, byAverage ? (byAverage.rec.goals / byAverage.rec.goalPj).toFixed(2) : '—', 'G/PJ', byAverage ? byAverage.rec.goalPj : null, 'PJ reg.')}
        ${hubPodiumCard('GOLEADOR', byGoals, byGoals ? byGoals.rec.goals : '—', 'Goles', byGoals && byGoals.rec.goalPj ? (byGoals.rec.goals / byGoals.rec.goalPj).toFixed(2) : null, 'G/PJ', 'Goleador de Oro')}
        ${hubPodiumCard('MÁS PRESENTE', byGames, byGames ? byGames.rec.pj : '—', 'PJ', byGames ? `${byGames.rec.w}V` : null, 'Ganados')}
      </div>
    </section>

    <section class="hub-grid">
      <div class="hub-panel"><div class="hub-panel-head"><div><div class="hub-panel-kicker">TABLA DEL CLUB</div><div class="hub-panel-title">GOLES</div></div><button class="hub-mini-btn" onclick="switchTab('goles')">Planilla ↗</button></div>${hubScorersHTML(rows)}</div>
      <aside class="hub-panel"><div class="hub-panel-head"><div><div class="hub-panel-kicker">MOVIMIENTO</div><div class="hub-panel-title">ÚLTIMA ACTIVIDAD</div></div></div>${hubActivityHTML(played)}</aside>
    </section>
    <section class="hub-quick-grid"><button class="hub-quick" onclick="switchTab('asistencia')"><div class="hub-quick-icon">📣</div><div><b>Confirmar asistencia</b><span>Quién está para el sábado</span></div></button><button class="hub-quick" onclick="switchTab('jugadores')"><div class="hub-quick-icon">👥</div><div><b>Explorar plantel</b><span>${state.players.length} cartas del club</span></div></button>${quickThird}</section>
  </div>`;
}

// ============================================================
