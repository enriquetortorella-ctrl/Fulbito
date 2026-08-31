// MATCHDAY CENTRAL — portada operativa del club
// ============================================================
function hubTeamPlayers(m, index) {
  const players = ((((m.teams || [])[index] || {}).players) || []);
  const names = players.map(p => escapeHtml(p.name)).join(' · ') || 'Plantel por confirmar';
  const count = players.length;
  return `<span class="hub-team-roster">${names}</span><span class="hub-team-count">👥 ${count} ${count === 1 ? 'jugador' : 'jugadores'}</span>`;
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

// Goleadores del partido que encabeza la planilla. El ranking acumulado vive
// en Goles/Stats; acá cada número pertenece exclusivamente a este encuentro.
function hubMatchScorersHTML(latest) {
  if (!latest || !matchHasGoals(latest)) return `<div class="hub-empty-result">Este partido no tiene goles registrados todavía.</div>`;
  const goals = getGoals(latest);
  const teams = (latest.teams || []).slice(0, 2);
  const sheets = teams.map((team, index) => {
    const scorers = (team.players || []).map(player => ({
      id: player.id,
      name: player.name,
      goals: Number(goals[player.id] || 0)
    })).filter(player => player.goals > 0).sort((a,b) => b.goals - a.goals || a.name.localeCompare(b.name));
    const accent = index === 0 ? 'team-a' : 'team-b';
    const label = `EQUIPO ${TEAM_NAMES[index] || index + 1}`;
    return `<section class="hub-team-goal-sheet ${accent}">
      <div class="hub-team-goal-head"><span>${index === 0 ? '🔵' : '🔴'} ${label}</span><b>${teamGoals(latest, index)}</b><small>GOLES</small></div>
      <div class="hub-team-goal-list">${scorers.length ? scorers.map(player => `<button class="hub-team-goal-row" onclick="openPlayerProfile('${player.id}')"><span>${escapeHtml(player.name)}</span><b>${player.goals}</b><i>⚽</i></button>`).join('') : '<div class="hub-team-goal-empty">Sin goleadores cargados</div>'}</div>
    </section>`;
  });
  return `<div class="hub-team-goal-sheets">${sheets.join('')}</div>`;
}

// Resumen del mismo partido: complementa la planilla sin duplicar sus goles.
function hubMatchSummaryHTML(latest) {
  if (!latest) return `<div class="hub-empty-result">Cuando haya un partido cerrado, acá aparecerá su resumen.</div>`;
  const scorers = matchScorers(latest);
  const mvp = latest.result?.mvp ? matchPlayerName(latest, latest.result.mvp) : 'Sin MVP cargado';
  const topScorer = scorers[0] ? `${scorers[0].name} · ${scorers[0].goals}` : 'Sin goles cargados';
  const result = hubResultText(latest);
  return `<div class="hub-match-summary">
    <div class="hub-summary-result"><span>RESULTADO</span><b>${escapeHtml(result.toUpperCase())}</b><small>📅 ${formatMatchDate(latest)}</small></div>
    <div class="hub-summary-row"><i>⭐</i><div><span>MVP DEL PARTIDO</span><b>${escapeHtml(mvp)}</b></div></div>
    <div class="hub-summary-row"><i>⚽</i><div><span>MÁXIMO ANOTADOR</span><b>${escapeHtml(topScorer)}</b></div></div>
    <div class="hub-summary-row"><i>✅</i><div><span>PLANILLA</span><b>${hasGoalsTracking(latest) ? 'Goles registrados' : 'Sin registro de goles'}</b></div></div>
  </div>`;
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
  const podium = getHubPodium(rows, played);
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
      <div class="hub-hero-copy"><div><div class="hub-kicker"><span class="hub-live-dot"></span> MATCHDAY CENTRAL · EL FULBITO</div><h1>TODO EL FULBITO,<br><strong>EN UNA MIRADA.</strong></h1><p>Buenas, ${greeting}. Tu central para confirmar, competir y seguir la historia del club.</p></div><div class="hub-hero-actions"><button class="btn btn-primary btn-sm" onclick="switchTab('asistencia')">✅ Ver asistencia</button><button class="btn btn-ghost btn-sm" onclick="switchTab('partidos')">📜 Temporada</button></div></div>
      <aside class="hub-attendance"><div class="hub-attendance-top"><div><div class="hub-panel-label">TU DISPONIBILIDAD</div><div class="hub-attendance-state ${attendance ? `is-${attendance}` : ''}">${attendanceState}</div><div class="hub-attendance-copy">${attendanceCopy}</div></div><div style="font-size:22px">${attendance === 'going' ? '✅' : attendance === 'notgoing' ? '❌' : '⚽'}</div></div><div class="hub-choice-row"><button class="hub-choice going${attendance === 'going' ? ' active' : ''}" onclick="setAttendance('${me?.id || ''}','going')">✅ VOY</button><button class="hub-choice notgoing${attendance === 'notgoing' ? ' active' : ''}" onclick="setAttendance('${me?.id || ''}','notgoing')">❌ NO VOY</button></div><div class="hub-attendance-meter"><div class="going"><b>${going}</b><span>Van</span></div><div class="no"><b>${notgoing}</b><span>No van</span></div><div><b>${pending}</b><span>Faltan</span></div></div></aside>
    </section>
    ${fixtureHTML}
    <section class="hub-command-grid">
      <section class="hub-panel hub-matchcentre">
        <div class="hub-score-stage">
          <div class="hub-score-stage-top"><div><div class="hub-panel-kicker">ARCHIVO DEL CLUB</div><div class="hub-panel-title">PLANILLA DE GOLES</div></div><div class="hub-match-picker"><span>PARTIDOS</span><button class="hub-mini-btn" onclick="switchTab('partidos')">ÚLTIMO PARTIDO⌄</button></div></div>
          ${lastMatchHTML}
        </div>
        <div class="hub-matchcentre-lower">
          <section class="hub-matchcentre-scorers"><div class="hub-subhead"><span>⚽</span><b>GOLEADORES DEL PARTIDO</b><button class="hub-mini-btn" onclick="switchTab('goles')">Planilla ↗</button></div>${hubMatchScorersHTML(latest)}</section>
          <aside class="hub-matchcentre-activity"><div class="hub-subhead"><span>✦</span><b>RESUMEN DEL PARTIDO</b></div>${hubMatchSummaryHTML(latest)}</aside>
        </div>
      </section>

      <aside class="hub-live-podium">
        <div class="hub-panel-head"><div><div class="hub-panel-kicker">FORMA ACTUAL</div><div class="hub-panel-title">PODIO DEL CLUB</div></div><button class="hub-mini-btn" onclick="switchTab('partidos')">Stats ↗</button></div>
        <div class="hub-live-cards">
          ${hubLiveCard('MÁXIMO GOLEADOR', podium.scorer, podium.scorer ? podium.scorer.rec.goals : '—', 'GOLES', 'is-scorer', podium.highlights)}
          ${hubLiveCard('ÚLTIMO MVP', podium.latestMvp, podium.latestMvp ? '★' : '—', podium.latestMvp ? 'FIGURA' : 'SIN DATOS', 'is-mvp', podium.highlights)}
          ${hubLiveCard(podium.streak?.streak ? 'MEJOR RACHA' : 'MÁS MVP', podium.streak, podium.streak ? (podium.streak.streak || podium.streak.rec.mvps) : '—', podium.streak?.streak ? 'VICTORIAS' : 'MVP', 'is-streak', podium.highlights)}
        </div>
      </aside>
    </section>
    <section class="hub-quick-grid"><button class="hub-quick" onclick="switchTab('asistencia')"><div class="hub-quick-icon">📣</div><div><b>Confirmar asistencia</b><span>Quién está para el sábado</span></div></button><button class="hub-quick" onclick="switchTab('jugadores')"><div class="hub-quick-icon">👥</div><div><b>Explorar plantel</b><span>${state.players.length} cartas del club</span></div></button>${quickThird}</section>
  </div>`;
}

// ============================================================
