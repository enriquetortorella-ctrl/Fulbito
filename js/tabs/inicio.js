// MATCHDAY CENTRAL — portada operativa del club
// ============================================================
function hubTeamPlayers(m, index) {
  const players = ((((m.teams || [])[index] || {}).players) || []);
  const names = players.map(p => escapeHtml(p.name)).join(' · ') || 'Plantel por confirmar';
  const count = players.length;
  return `<span class="hub-team-roster">${names}</span><span class="hub-team-count">👥 ${count} ${count === 1 ? 'jugador' : 'jugadores'}</span>`;
}

function hubResultText(m) {
  return matchResultText(m);
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
  const tier = getCardTier(item.ovr ?? 0);
  const photo = safePhotoUrl(p.photo);
  const portrait = photo
    ? `<div class="podium-portrait"><img src="${escapeHtml(photo)}" alt="${escapeHtml(p.name)}"></div>`
    : `<div class="podium-portrait is-placeholder" aria-hidden="true">⚽</div>`;
  const secondHTML = second !== undefined && second !== null
    ? `<div><b>${second}</b><span>${secondUnit}</span></div>` : '';
  return `<article class="podium-card tier-${tier.cls}${badge ? ' is-hero' : ''}" ${typeof profileRowAttributes === 'function' ? profileRowAttributes(p) : ''}>
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
  const teams = latest.teams || [];
  const sheets = teams.map((team, index) => {
    const scorers = (team.players || []).map(player => ({
      id: player.id,
      name: player.name,
      goals: Number(goals[player.id] || 0)
    })).filter(player => player.goals > 0).sort((a,b) => b.goals - a.goals || a.name.localeCompare(b.name));
    const accent = `team-${String.fromCharCode(97 + index)}`;
    const label = `EQUIPO ${TEAM_NAMES[index] || index + 1}`;
    return `<section class="hub-team-goal-sheet ${accent}">
      <div class="hub-team-goal-head"><span>${TEAM_EMOJIS[index] || '⚪'} ${label}</span><b>${teamGoals(latest, index)}</b><small>GOLES</small></div>
      <div class="hub-team-goal-list">${scorers.length ? scorers.map(player => {
        const hasProfile = state.players.some(item => item.id === player.id);
        const tag = hasProfile ? 'button' : 'div';
        return `<${tag} class="hub-team-goal-row${hasProfile ? '' : ' is-static'}"${hasProfile ? ` onclick="openPlayerProfile('${player.id}')"` : ''}><span>${escapeHtml(player.name)}</span><b>${player.goals}</b><i>⚽</i></${tag}>`;
      }).join('') : '<div class="hub-team-goal-empty">Sin goleadores cargados</div>'}</div>
    </section>`;
  });
  return `<div class="hub-team-goal-sheets">${sheets.join('')}</div>`;
}

// Resumen del mismo partido: complementa la planilla sin duplicar sus goles.
function hubMatchSummaryHTML(latest) {
  if (!latest) return `<div class="hub-empty-result">Cuando haya un partido cerrado, acá aparecerá su resumen.</div>`;
  const scorers = matchScorers(latest);
  const mvp = latest.result?.mvp ? matchPlayerName(latest, latest.result.mvp) : 'Sin MVP cargado';
  const maxGoals = scorers[0]?.goals || 0;
  const topScorers = maxGoals ? scorers.filter(player => player.goals === maxGoals) : [];
  const topScorer = topScorers.length
    ? `${topScorers.map(player => player.name).join(' · ')} · ${maxGoals} gol${maxGoals === 1 ? '' : 'es'}`
    : 'Sin goles cargados';
  const topScorerLabel = topScorers.length > 1 ? 'MÁXIMOS ANOTADORES' : 'MÁXIMO ANOTADOR';
  const result = hubResultText(latest);
  return `<div class="hub-match-summary">
    <div class="hub-summary-result"><span>RESULTADO</span><b>${escapeHtml(result.toUpperCase())}</b><small>📅 ${formatMatchDate(latest)}</small></div>
    <div class="hub-summary-row"><i>⭐</i><div><span>MVP DEL PARTIDO</span><b>${escapeHtml(mvp)}</b></div></div>
    <div class="hub-summary-row"><i>⚽</i><div><span>${topScorerLabel}</span><b>${escapeHtml(topScorer)}</b></div></div>
    <div class="hub-summary-row"><i>✅</i><div><span>PLANILLA</span><b>${hasGoalsTracking(latest) ? 'Goles registrados' : 'Sin registro de goles'}</b></div></div>
  </div>`;
}

function hubLeaderRow(icon, label, item, value, meta) {
  const name = item?.p?.name || 'A definir';
  return `<div class="hub-leader">
    <div class="hub-leader-icon">${icon}</div>
    <div class="hub-leader-copy"><div class="hub-leader-label">${escapeHtml(label)}</div><div class="hub-leader-name">${escapeHtml(name)}</div></div>
    <div><div class="hub-leader-value">${value}</div><div class="hub-leader-meta">${meta}</div></div>
  </div>`;
}

function hubDateISO(m) {
  return m?.match_date || (m?.created_at || '').slice(0,10);
}

function hubTodayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const CLUB_WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function getClubSchedule(club = state.currentClub) {
  const weekday = Number(club?.matchWeekday);
  const time = String(club?.matchTime || '');
  const venue = safePlainText(club?.matchVenue || '', 80).trim();
  const address = safePlainText(club?.matchAddress || '', 140).trim();
  return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && venue
    ? { weekday, time, venue, address }
    : null;
}

function getNextClubMatch(schedule = getClubSchedule()) {
  if (!schedule) return null;
  const [hours, minutes] = schedule.time.split(':').map(Number);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});
  const today = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  let daysUntil = (schedule.weekday - today.getUTCDay() + 7) % 7;
  const timeAlreadyPassed = daysUntil === 0 && (parts.hour > hours || (parts.hour === hours && parts.minute >= minutes));
  if (timeAlreadyPassed) daysUntil = 7;
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() + daysUntil);
  // Mediodía UTC conserva la fecha argentina al formatearla y evita que un
  // cambio de huso horario del teléfono mueva el partido al día anterior.
  date.setUTCHours(12, 0, 0, 0);
  return { ...schedule, date, daysUntil };
}

// Al guardar los equipos el mismo día del partido, conserva la jornada de hoy
// incluso si ya pasó la hora de inicio. `getNextClubMatch` sí puede avanzar a
// la semana siguiente porque se usa como anuncio del próximo encuentro.
function getClubMatchDateForSave(schedule = getClubSchedule()) {
  if (!schedule) return hubTodayISO();
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  const today = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
  const weekday = new Date(Date.UTC(Number(nowParts.year), Number(nowParts.month) - 1, Number(nowParts.day))).getUTCDay();
  if (weekday === schedule.weekday) return today;
  const next = getNextClubMatch(schedule);
  return next?.date instanceof Date ? next.date.toISOString().slice(0, 10) : today;
}

function clubNextMatchText(next = getNextClubMatch()) {
  if (!next) return '';
  const day = next.date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${next.time}`;
}

function clubMatchCountdown(next = getNextClubMatch()) {
  if (!next) return '';
  if (next.daysUntil > 0) return `FALTAN ${next.daysUntil} ${next.daysUntil === 1 ? 'DÍA' : 'DÍAS'}`;
  return 'HOY SE JUEGA';
}

function hubHeroMatchHTML(greeting, next) {
  if (!next) {
    return `<div><div class="hub-kicker"><span class="hub-live-dot"></span> MATCHDAY CENTRAL · EL FULBITO</div><h1>TODO EL FULBITO,<br><strong>EN UNA MIRADA.</strong></h1><p>Buenas, ${escapeHtml(greeting)}. Tu central para confirmar, competir y seguir la historia del club.</p></div>`;
  }
  const dateText = next.date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.address || next.venue)}`;
  return `<div class="hub-hero-match-copy"><div class="hub-kicker"><span class="hub-live-dot"></span> PRÓXIMO PARTIDO · ${escapeHtml(state.currentClub.name)}</div><h1><strong>${escapeHtml(dateText)}</strong></h1><div class="hub-hero-match-details"><span>🕒 ${escapeHtml(next.time)} HS</span><a class="hub-match-venue-link" href="${mapsUrl}" target="_blank" rel="noopener noreferrer" title="Abrir ${escapeHtml(next.venue)} en Google Maps">📍 ${escapeHtml(next.venue)} <i>↗</i></a></div><div class="hub-match-countdown">⏱ ${clubMatchCountdown(next)}</div><p>Buenas, ${escapeHtml(greeting)}. Confirmá tu asistencia para que el plantel llegue listo al partido.</p></div>`;
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
  const currentOvr = current ? getOverall(current) : null;
  const ovr = Number.isFinite(currentOvr) ? currentOvr : (Number.isFinite(matchPlayer.ovr) ? matchPlayer.ovr : null);
  const record = matchPlayer.isGuest ? null : getPlayerRecord(matchPlayer.id);
  const photo = safePhotoUrl(current?.photo || matchPlayer.photo);
  const avatar = photo
    ? `<img class="fixture-avatar" src="${escapeHtml(photo)}" alt="">`
    : `<div class="fixture-avatar fixture-avatar-ph">${posEmoji(pos) || '👤'}</div>`;
  const metrics = record
    ? `<div class="fixture-player-metrics"><span class="fixture-player-metric"><b>${ovr ?? '—'}</b>OVR</span><span class="fixture-player-metric"><b>${record.pj}</b>PJ</span><span class="fixture-player-metric goal"><b>${record.goalPj ? (record.goals / record.goalPj).toFixed(2) : '—'}</b>G/P</span></div>`
    : `<span class="fixture-player-guest">INVITADO</span>`;
  return `<div class="fixture-player">${avatar}<div style="min-width:0"><div class="fixture-player-name">${escapeHtml(matchPlayer.name)}</div><div class="fixture-player-pos">${escapeHtml(POS_LABELS[pos] || pos)}</div></div>${metrics}</div>`;
}

function hubFixtureTeamHTML(m, team, index) {
  const players = team.players || [];
  const rated = players.map(p => {
    const current = state.players.find(x => x.id === p.id);
    const currentOvr = current ? getOverall(current) : null;
    const ovr = Number.isFinite(currentOvr) ? currentOvr : (Number.isFinite(p.ovr) ? p.ovr : null);
    return { p, ovr };
  });
  const withOvr = rated.filter(item => Number.isFinite(item.ovr));
  const avgOvr = withOvr.length ? Math.round(withOvr.reduce((sum, x) => sum + x.ovr, 0) / withOvr.length) : '—';
  const figure = withOvr.slice().sort((a,b) => b.ovr - a.ovr || a.p.name.localeCompare(b.p.name))[0];
  return `<section class="fixture-team"><div class="fixture-team-head"><div class="fixture-team-name">${TEAM_EMOJIS[index] || '⚪'} Equipo ${TEAM_NAMES[index] || index + 1}</div><div class="fixture-ovr">OVR ${avgOvr}</div></div><div class="fixture-figure"><span>⭐ FIGURA</span><b>${figure ? `${escapeHtml(figure.p.name)} · ${figure.ovr}` : 'Plantel por confirmar'}</b></div><div class="fixture-players">${players.length ? players.map(hubFixturePlayerHTML).join('') : '<div class="text-muted" style="padding:8px">Sin jugadores asignados</div>'}</div></section>`;
}

function hubFixtureHTML(m) {
  const teams = m.teams || [];
  const isLive = hasGoalsTracking(m);
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
    root.innerHTML = `<div class="hub-shell"><section class="hub-hero"><div class="hub-hero-copy"><div><div class="hub-kicker"><span class="hub-live-dot"></span> SOPORTE MAESTRO · ACCESO VERIFICADO</div><h1>GESTIONANDO<br><strong>${escapeHtml(state.currentClub.name.toUpperCase())}</strong></h1><p>Administrá el plantel y los partidos sin mezclar tu perfil con el de este club.</p></div><div class="hub-hero-actions"><button class="btn btn-primary btn-sm" onclick="switchTab('admin')">⚙️ Administrar club</button><button class="btn btn-ghost btn-sm" onclick="openPlatformAdmin()">🛡️ Cambiar club</button></div></div><aside class="hub-attendance"><div class="hub-panel-label">ESTADO DEL CLUB</div><div class="hub-attendance-meter"><div class="going"><b>${going}</b><span>Van</span></div><div><b>${pending}</b><span>Faltan</span></div><div><b>${openMatches}</b><span>Abiertos</span></div></div><div class="hub-attendance-copy" style="margin-top:14px">El detalle de calificaciones también está disponible para auditoría en Admin.</div></aside></section></div>`;
    return;
  }

  const me = getMe();
  const viewer = me || state.currentUser;
  const attendanceReady = !!me;
  const going = state.players.filter(p => p.attendance === 'going').length;
  const notgoing = state.players.filter(p => p.attendance === 'notgoing').length;
  const pending = Math.max(0, state.players.length - going - notgoing);
  const attendance = me?.attendance || null;
  const attendanceState = !attendanceReady ? 'PLANTEL SIN CARGAR' : attendance === 'going' ? 'ESTÁS ADENTRO' : attendance === 'notgoing' ? 'ESTA VEZ NO VAS' : '¿JUGÁS EL PRÓXIMO PARTIDO?';
  const attendanceCopy = !attendanceReady
    ? 'No pudimos recuperar tu ficha. Reintentá para habilitar la confirmación.'
    : attendance === 'going'
    ? 'Perfecto. Ya te contamos para armar los equipos.'
    : attendance === 'notgoing'
      ? 'Si cambiás de idea, podés volver a marcar que vas.'
      : 'Confirmá tu lugar para que el plantel se organice a tiempo.';
  const attendanceControls = attendanceReady
    ? `<div class="hub-choice-row"><button class="hub-choice going${attendance === 'going' ? ' active' : ''}" onclick="setAttendance('${me.id}','going')">✅ VOY</button><button class="hub-choice notgoing${attendance === 'notgoing' ? ' active' : ''}" onclick="setAttendance('${me.id}','notgoing')">❌ NO VOY</button></div>`
    : `<div class="hub-choice-row is-retry"><button class="hub-choice retry" onclick="retryAttendancePlayers(this)">↻ REINTENTAR CARGA</button></div>`;

  const played = matches.filter(isPlayed).slice().sort((a,b) =>
    `${b.match_date || ''}${b.created_at || ''}`.localeCompare(`${a.match_date || ''}${a.created_at || ''}`)
  );
  const latest = played[0] || null;
  const openMatch = hubOpenMatch();
  const rows = state.players.map(p => ({ p, rec: getPlayerRecord(p.id), ovr: getOverall(p) }));
  const podium = getHubPodium(rows, played);
  const greeting = (viewer?.name || 'equipo').split(' ')[0];

  let lastMatchHTML = `<div class="hub-empty-result">Todavía no hay un resultado cerrado. Cuando se juegue el primero, este espacio va a guardar la historia del club.</div>`;
  if (latest) {
    const teams = latest.teams || [];
    const scores = matchScore(latest);
    const mvp = latest.result?.mvp ? matchPlayerName(latest, latest.result.mvp) : null;
    const scorers = matchScorers(latest).slice(0, 3);
    const scoreVisual = teams.length === 3
      ? `<div class="hub-last-match hub-last-match-three">${teams.map((team, i) => `<div class="hub-team"><div class="hub-team-name">${TEAM_EMOJIS[i] || '⚪'} Equipo ${TEAM_NAMES[i] || i + 1}</div><div class="hub-score-single">${hasGoalsTracking(latest) ? (scores[i] || 0) : '—'}</div><div class="hub-team-sub">${hubTeamPlayers(latest, i)}</div></div>`).join('')}</div>`
      : `<div class="hub-last-match"><div class="hub-team"><div class="hub-team-name">${TEAM_EMOJIS[0] || '⚪'} Equipo ${TEAM_NAMES[0] || 1}</div><div class="hub-team-sub">${hubTeamPlayers(latest, 0)}</div></div><div class="hub-score-wrap"><div class="hub-score">${hasGoalsTracking(latest) ? matchScoreStr(latest) : '—'}</div><div class="hub-result">${hubResultText(latest)}</div></div><div class="hub-team"><div class="hub-team-name">Equipo ${TEAM_NAMES[1] || 2} ${TEAM_EMOJIS[1] || '⚪'}</div><div class="hub-team-sub">${hubTeamPlayers(latest, 1)}</div></div></div>`;
    const meta = [`<span class="hub-meta-chip">📅 <strong>${formatMatchDate(latest)}</strong></span>`];
    if (mvp) meta.push(`<span class="hub-meta-chip">⭐ MVP <strong>${escapeHtml(mvp)}</strong></span>`);
    if (scorers.length) meta.push(`<span class="hub-meta-chip">⚽ ${scorers.map(s => `${escapeHtml(s.name)} ${s.goals}`).join(' · ')}</span>`);
    lastMatchHTML = `${scoreVisual}<div class="hub-match-meta">${meta.join('')}<div class="hub-match-actions"><button class="hub-mini-btn" onclick="switchTab('partidos')">Ver historial</button><button class="hub-mini-btn" onclick="shareMatchResult('${latest.id}')">Compartir</button></div></div>`;
  }

  const fixtureHTML = openMatch ? hubFixtureHTML(openMatch) : '';
  const nextMatch = getNextClubMatch();
  const fallbackValue = '—';
  const quickThird = state.currentUser?.isAdmin
    ? `<button class="hub-quick" onclick="switchTab('equipos')"><div class="hub-quick-icon">🏆</div><div><b>Armar equipos</b><span>Equilibrar el próximo partido</span></div></button>`
    : `<button class="hub-quick" onclick="openEditProfile()"><div class="hub-quick-icon">🪪</div><div><b>Mi carta</b><span>Editar foto y posición</span></div></button>`;

  root.innerHTML = `<div class="hub-shell">
    <section class="hub-hero${nextMatch ? ' is-matchday' : ''}">
      <div class="hub-hero-copy">${hubHeroMatchHTML(greeting, nextMatch)}<div class="hub-hero-actions"><button class="btn btn-primary btn-sm" onclick="switchTab('asistencia')">✅ Ver asistencia</button><button class="btn btn-ghost btn-sm" onclick="switchTab('partidos')">📜 Temporada</button></div></div>
      <aside class="hub-attendance"><div class="hub-attendance-top"><div><div class="hub-panel-label">TU DISPONIBILIDAD</div><div class="hub-attendance-state ${attendance ? `is-${attendance}` : ''}">${attendanceState}</div><div class="hub-attendance-copy">${attendanceCopy}</div></div><div style="font-size:22px">${!attendanceReady ? '↻' : attendance === 'going' ? '✅' : attendance === 'notgoing' ? '❌' : '⚽'}</div></div>${attendanceControls}<div class="hub-attendance-meter"><div class="going"><b>${attendanceReady ? going : '—'}</b><span>Van</span></div><div class="no"><b>${attendanceReady ? notgoing : '—'}</b><span>No van</span></div><div><b>${attendanceReady ? pending : '—'}</b><span>Faltan</span></div></div></aside>
    </section>
    ${fixtureHTML}
    <section class="hub-command-grid">
      <section class="hub-panel hub-matchcentre">
        <div class="hub-score-stage">
          <div class="hub-score-stage-top"><div><div class="hub-panel-kicker">ARCHIVO DEL CLUB</div><div class="hub-panel-title">PLANILLA DE GOLES</div></div><div class="hub-match-picker"><span>PARTIDOS</span><button class="hub-mini-btn" onclick="switchTab('partidos')">VER HISTORIAL ↗</button></div></div>
          ${lastMatchHTML}
        </div>
        <div class="hub-matchcentre-lower">
          <section class="hub-matchcentre-scorers"><div class="hub-subhead"><span>⚽</span><b>GOLEADORES DEL PARTIDO</b><button class="hub-mini-btn" onclick="${latest ? `openGolesFor('${latest.id}')` : "switchTab('goles')"}">Planilla ↗</button></div>${hubMatchScorersHTML(latest)}</section>
          <aside class="hub-matchcentre-activity"><div class="hub-subhead"><span>✦</span><b>RESUMEN DEL PARTIDO</b></div>${hubMatchSummaryHTML(latest)}</aside>
        </div>
      </section>

      <aside class="hub-live-podium">
        <div class="hub-panel-head"><div><div class="hub-panel-kicker">DESTACADOS DEL CLUB</div><div class="hub-panel-title">PODIO DEL CLUB</div></div><button class="hub-mini-btn" onclick="switchTab('stats')">Stats ↗</button></div>
        <div class="hub-live-cards">
          ${hubLiveCard(podium.scorerLabel || 'GOLEADOR DESTACADO', podium.scorer, podium.scorer ? podium.scorer.rec.goals : '—', 'GOLES', 'is-scorer', podium.highlights)}
          ${hubLiveCard('ÚLTIMO MVP', podium.latestMvp, podium.latestMvp ? '★' : '—', podium.latestMvp ? 'FIGURA' : 'SIN DATOS', 'is-mvp', podium.highlights)}
          ${hubLiveCard(podium.streakLabel || 'OTRO REFERENTE', podium.streak, podium.streak ? (podium.streak.streak || podium.streak.rec.mvps) : '—', podium.streak?.streak ? 'VICTORIAS' : 'MVP', 'is-streak', podium.highlights)}
        </div>
      </aside>
    </section>
    <section class="hub-quick-grid"><button class="hub-quick" onclick="switchTab('asistencia')"><div class="hub-quick-icon">📣</div><div><b>Confirmar asistencia</b><span>${nextMatch ? `Quién está para ${escapeHtml(clubNextMatchText(nextMatch).split(' · ')[0])}` : 'Quién está para el próximo partido'}</span></div></button><button class="hub-quick" onclick="switchTab('jugadores')"><div class="hub-quick-icon">👥</div><div><b>Explorar plantel</b><span>${state.players.length} ${state.players.length === 1 ? 'carta' : 'cartas'} del club</span></div></button>${quickThird}</section>
  </div>`;
}

// ============================================================
