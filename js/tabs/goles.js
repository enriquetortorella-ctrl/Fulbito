// GOLES — planilla en vivo (cualquiera puede anotar)
// ============================================================
let golesMatchId = null;
let _goalSaveTimer = null;
let _goalSavePending = null;
let _goalWriteQueue = Promise.resolve();
let _goalWritesPending = 0;
let _goalWriteGeneration = 0;
let _goalReadGeneration = 0;
let _goalAssistPending = null;
let _goalAssistSaving = false;
let _goalAssistReturnFocus = null;
const _goalRemovalRetryIds = new Map();

function openGolesFor(id) {
  golesMatchId = id;
  switchTab('goles');
}

async function refreshGoles() {
  const reconciled = await reconcilePendingGoalWrites();
  if (!reconciled) await loadGoalMatchesSnapshot(_goalWriteGeneration);
  renderGoles();
  showToast('🔄 Planilla actualizada');
}

function getActiveMatchId() {
  if (golesMatchId && matches.find(m => m.id === golesMatchId)) return golesMatchId;
  const abierto = matches.find(m => !isPlayed(m));
  return (abierto || matches[0] || {}).id || null;
}

function setSaveState(txt) {
  const el = document.getElementById('goles-save-state');
  if (el) el.textContent = txt;
}

function createGoalMutationId() {
  const randomPart = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `ge-${Date.now().toString(36)}-${randomPart.slice(0, 24)}`;
}

// Evita que una lectura lenta sobrescriba una escritura o una lectura más
// reciente. `loadMatches` devuelve [] también ante error, por eso se conserva
// la planilla visible cuando ya había partidos cargados.
async function loadGoalMatchesSnapshot(expectedWriteGeneration = _goalWriteGeneration) {
  const readGeneration = ++_goalReadGeneration;
  const freshMatches = await loadMatches();
  if (readGeneration !== _goalReadGeneration ||
      expectedWriteGeneration !== _goalWriteGeneration ||
      _goalWritesPending > 0) return null;
  if (freshMatches.length || !matches.length) {
    matches = freshMatches;
    return freshMatches;
  }
  return null;
}

async function recoverGoalStateAfterFailure() {
  await _goalWriteQueue;
  const expectedWriteGeneration = _goalWriteGeneration;
  const freshMatches = await loadGoalMatchesSnapshot(expectedWriteGeneration);
  if (freshMatches !== null) renderGoles();
  return freshMatches;
}

function goalPlayerContext(m, playerId) {
  const found = [];
  (m.teams || []).forEach((team, teamIndex) => {
    const player = (team.players || []).find(item => item.id === playerId);
    if (player) found.push({ team, teamIndex, player });
  });
  return found.length === 1 ? found[0] : null;
}

function goalAssistInitials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?';
}

function openGoalAssistPicker(mid, scorerId) {
  if (_goalAssistSaving) return;
  const m = matches.find(item => item.id === mid);
  const context = m && goalPlayerContext(m, scorerId);
  if (!m || !context) {
    showToast('❌ No pudimos identificar al goleador en un único equipo', 3400);
    return;
  }

  const teammates = (context.team.players || []).filter(player => player.id !== scorerId);
  // El mismo id se reutiliza si la respuesta se pierde y el usuario reintenta:
  // el servidor puede reconocer la operación y evita sumar el gol dos veces.
  _goalAssistReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  _goalAssistPending = { mid, scorerId, teamIndex: context.teamIndex, eventId: createGoalMutationId(), selectionKey: null };
  const teammateButtons = teammates.map(player => `<button type="button" class="goal-assist-player" data-player-id="${escapeHtml(player.id)}" onclick="confirmGoalAssist('player',this.dataset.playerId)">
    <span class="goal-assist-avatar">${escapeHtml(goalAssistInitials(player.name))}</span>
    <span>${escapeHtml(player.name)}${player.isGuest ? ' 👤' : ''}<small>Compañero · Equipo ${TEAM_NAMES[context.teamIndex] || context.teamIndex + 1}</small></span>
  </button>`).join('');

  document.getElementById('modal-goal-assist-content').innerHTML = `
    <div class="goal-assist-kicker">Gol registrado al confirmar</div>
    <h2 class="goal-assist-title" id="goal-assist-title">⚽ GOL DE <strong>${escapeHtml(context.player.name)}</strong></h2>
    <p class="goal-assist-question">¿Quién dio la asistencia?</p>
    <div class="goal-assist-list">
      ${teammateButtons || '<div class="goal-assist-note">No hay otro compañero cargado en este equipo.</div>'}
    </div>
    <div class="goal-assist-divider">Sin pase de un compañero</div>
    <div class="goal-assist-specials">
      <button type="button" class="goal-assist-special" onclick="confirmGoalAssist('individual')"><b>⚡</b>Jugada individual</button>
      <button type="button" class="goal-assist-special" onclick="confirmGoalAssist('rebound')"><b>🥅</b>Rebote</button>
    </div>
    <p class="goal-assist-note">El gol se guarda recién cuando elijas una opción.</p>
    <div class="goal-assist-status" id="goal-assist-status" role="status" aria-live="polite">⏳ Guardando gol y asistencia…</div>`;

  const modal = document.querySelector('#modal-goal-assist .goal-assist-modal');
  if (modal) modal.classList.remove('is-saving');
  document.querySelectorAll('#modal-goal-assist button').forEach(button => { button.disabled = false; });
  openModal('modal-goal-assist');
  setTimeout(() => document.querySelector('#modal-goal-assist-content button')?.focus(), 40);
}

function cancelGoalAssist(force = false) {
  if (_goalAssistSaving && !force) return;
  _goalAssistPending = null;
  _goalAssistSaving = false;
  document.querySelector('#modal-goal-assist .goal-assist-modal')?.classList.remove('is-saving');
  document.querySelectorAll('#modal-goal-assist button').forEach(button => { button.disabled = false; });
  closeModal('modal-goal-assist');
  const returnFocus = _goalAssistReturnFocus;
  _goalAssistReturnFocus = null;
  if (!force && returnFocus && returnFocus.isConnected) setTimeout(() => returnFocus.focus(), 0);
}

function focusGoalTrigger(mid, scorerId) {
  setTimeout(() => {
    const button = [...document.querySelectorAll('.goal-btn.plus')].find(item =>
      item.dataset.matchId === mid && item.dataset.goalKey === scorerId
    );
    if (button) button.focus({ preventScroll: true });
  }, 0);
}

function handleGoalAssistKeydown(event) {
  if (event.key !== 'Tab') return;
  const overlay = document.getElementById('modal-goal-assist');
  if (!overlay || !overlay.classList.contains('open')) return;
  const focusable = [...overlay.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setGoalAssistError(message) {
  const status = document.getElementById('goal-assist-status');
  const modal = document.querySelector('#modal-goal-assist .goal-assist-modal');
  if (modal) modal.classList.remove('is-saving');
  if (status) {
    status.className = 'goal-assist-status show error';
    status.textContent = `❌ ${message}`;
  }
  document.querySelectorAll('#modal-goal-assist button').forEach(button => { button.disabled = false; });
}

function applyGoalDelta(m, key, delta, removeEvent = false) {
  if (!m.result) m.result = { winner: null, margin: null, mvp: null, goals: {}, goalsTracked: true };
  if (!m.result.goals) m.result.goals = {};
  m.result.goalsTracked = true;
  const current = Number(m.result.goals[key] || 0);
  const next = Math.max(0, current + delta);
  if (next === 0) delete m.result.goals[key];
  else m.result.goals[key] = next;

  if (removeEvent && Array.isArray(m.result.goalEvents)) {
    for (let i = m.result.goalEvents.length - 1; i >= 0; i--) {
      if (m.result.goalEvents[i] && m.result.goalEvents[i].scorerId === key) {
        m.result.goalEvents.splice(i, 1);
        break;
      }
    }
  }
}

function addGoal(mid, key, delta) {
  const m = matches.find(x => x.id === mid);
  if (!m) return;
  if (delta > 0 && !key.startsWith('__t')) {
    openGoalAssistPicker(mid, key);
    return;
  }
  if (delta < 0 && Number(getGoals(m)[key] || 0) <= 0) return;

  const isTrackedPlayer = !key.startsWith('__t');
  const previousResult = JSON.parse(JSON.stringify(m.result || null));
  applyGoalDelta(m, key, delta, isTrackedPlayer && delta < 0);
  paintGoals(m, key);
  if (isTrackedPlayer) queueGoalEventRemoval(mid, key, previousResult);
  else queueGoalWrite(mid, key, delta);
  if (delta > 0 && navigator.vibrate) navigator.vibrate(25);
}

function enqueueGoalRpc(name, params) {
  _goalWriteGeneration++;
  if (_goalSaveTimer) {
    clearTimeout(_goalSaveTimer);
    _goalSaveTimer = null;
  }
  _goalWritesPending++;
  setSaveState('✍️ Guardando…');
  let succeeded = false;
  const operation = _goalWriteQueue.then(() => callRpc(name, params));
  _goalWriteQueue = operation.catch(() => undefined);
  return operation
    .then(data => { succeeded = true; return data; })
    .finally(() => {
      _goalWritesPending--;
      if (_goalWritesPending !== 0) return;
      if (!succeeded) {
        setSaveState('⚠️ Sin guardar');
        return;
      }
      const refreshGeneration = _goalWriteGeneration;
      _goalSaveTimer = setTimeout(async () => {
        _goalSaveTimer = null;
        const focusedButton = document.activeElement?.classList?.contains('goal-btn')
          ? { mid: document.activeElement.dataset.matchId, key: document.activeElement.dataset.goalKey }
          : null;
        const freshMatches = await loadGoalMatchesSnapshot(refreshGeneration);
        if (freshMatches === null) return;
        renderGoles();
        if (focusedButton?.mid && focusedButton?.key) focusGoalTrigger(focusedButton.mid, focusedButton.key);
        setSaveState('✅ Guardado');
        setTimeout(() => setSaveState(''), 1600);
      }, 100);
    });
}

async function reconcilePendingGoalWrites() {
  if (!_goalWritesPending && !_goalSaveTimer) return false;
  await _goalWriteQueue;
  if (_goalSaveTimer) {
    clearTimeout(_goalSaveTimer);
    _goalSaveTimer = null;
  }
  const refreshGeneration = ++_goalWriteGeneration;
  const freshMatches = await loadGoalMatchesSnapshot(refreshGeneration);
  return freshMatches !== null;
}

// Cada toque viaja como una variación atómica al servidor: no se reemplaza el
// partido entero (operación reservada a admins) y dos celulares no se pisan.
function queueGoalWrite(mid, key, delta) {
  enqueueGoalRpc('fulbito_record_goal', {
    p_club_id: state.currentClub.id,
    p_match_id: mid,
    p_goal_key: key,
    p_delta: delta
  })
    .then(data => {
      const m = matches.find(item => item.id === mid);
      if (m && data && data.result) m.result = data.result;
    })
    .catch(async error => {
      console.error('record goal:', error);
      await recoverGoalStateAfterFailure();
      showToast(`❌ ${error.message || 'No se pudo guardar el gol'}`, 3600);
    });
}

function queueGoalEventRemoval(mid, scorerId, previousResult) {
  const retryKey = `${mid}:${scorerId}`;
  const mutationId = _goalRemovalRetryIds.get(retryKey) || createGoalMutationId();
  const operation = enqueueGoalRpc('fulbito_record_goal_event', {
    p_club_id: state.currentClub.id,
    p_match_id: mid,
    p_scorer_id: scorerId,
    p_delta: -1,
    p_event_id: mutationId,
    p_assist_type: null,
    p_assist_player_id: null
  });
  const operationGeneration = _goalWriteGeneration;
  operation
    .then(data => {
      if (_goalRemovalRetryIds.get(retryKey) === mutationId) _goalRemovalRetryIds.delete(retryKey);
      const m = matches.find(item => item.id === mid);
      if (m && data && data.result) {
        m.result = data.result;
        paintGoals(m, scorerId);
      }
    })
    .catch(async error => {
      console.error('remove goal event:', error);
      const freshMatches = await recoverGoalStateAfterFailure();
      const savedMatch = freshMatches?.find(item => item.id === mid);
      const savedMutationIds = savedMatch?.result?.goalEventMutationIds;
      if (Array.isArray(savedMutationIds) && savedMutationIds.includes(mutationId)) {
        if (_goalRemovalRetryIds.get(retryKey) === mutationId) _goalRemovalRetryIds.delete(retryKey);
        showToast('↩️ Corrección guardada', 2200);
        return;
      }
      _goalRemovalRetryIds.set(retryKey, mutationId);
      if (freshMatches === null && operationGeneration === _goalWriteGeneration) {
        const currentMatch = matches.find(item => item.id === mid);
        if (currentMatch) currentMatch.result = previousResult;
        renderGoles();
      }
      showToast(`❌ ${error.message || 'No se pudo corregir el gol'}`, 3600);
    });
}

async function confirmGoalAssist(assistType, assistPlayerId = null) {
  if (_goalAssistSaving || !_goalAssistPending) return;
  const pending = { ..._goalAssistPending };
  const m = matches.find(item => item.id === pending.mid);
  const context = m && goalPlayerContext(m, pending.scorerId);
  const allowedTypes = ['player', 'individual', 'rebound'];
  if (!m || !context || !allowedTypes.includes(assistType)) {
    setGoalAssistError('La opción elegida ya no está disponible. Volvé a intentarlo.');
    return;
  }

  const selectionKey = `${assistType}:${assistPlayerId || ''}`;
  if (pending.selectionKey && pending.selectionKey !== selectionKey) {
    setGoalAssistError('Para reintentar el mismo gol, elegí la misma opción del primer intento.');
    return;
  }

  let assister = null;
  if (assistType === 'player') {
    assister = (context.team.players || []).find(player => player.id === assistPlayerId && player.id !== pending.scorerId) || null;
    if (!assister) {
      setGoalAssistError('El asistidor debe ser un compañero del mismo equipo.');
      return;
    }
  }

  _goalAssistPending.selectionKey = selectionKey;

  _goalAssistSaving = true;
  const modal = document.querySelector('#modal-goal-assist .goal-assist-modal');
  const status = document.getElementById('goal-assist-status');
  if (modal) modal.classList.add('is-saving');
  if (status) {
    status.className = 'goal-assist-status show';
    status.textContent = '⏳ Guardando gol y asistencia…';
  }
  document.querySelectorAll('#modal-goal-assist button').forEach(button => { button.disabled = true; });

  try {
    const operation = enqueueGoalRpc('fulbito_record_goal_event', {
      p_club_id: state.currentClub.id,
      p_match_id: pending.mid,
      p_scorer_id: pending.scorerId,
      p_delta: 1,
      p_event_id: pending.eventId,
      p_assist_type: assistType,
      p_assist_player_id: assister ? assister.id : null
    });
    const operationGeneration = _goalWriteGeneration;
    const data = await operation;
    let savedMatch = m;
    if (data && data.result) m.result = data.result;
    else {
      const freshMatches = await loadGoalMatchesSnapshot(operationGeneration);
      savedMatch = freshMatches?.find(item => item.id === pending.mid) || m;
    }
    cancelGoalAssist(true);
    renderGoles();
    focusGoalTrigger(pending.mid, pending.scorerId);
    if (navigator.vibrate) navigator.vibrate(25);
    const savedEvent = getGoalEvents(savedMatch).find(event => event && event.id === pending.eventId);
    const savedType = savedEvent?.assistType || assistType;
    const savedAssister = savedEvent?.assistPlayerId ? matchPlayerName(savedMatch, savedEvent.assistPlayerId) : (assister ? assister.name : null);
    const detail = savedType === 'player' && savedAssister ? `🎯 Asistencia de ${savedAssister}` : savedType === 'individual' ? '⚡ Jugada individual' : '🥅 Gol de rebote';
    showToast(`⚽ Gol de ${context.player.name} · ${detail}`, 2600);
  } catch (error) {
    console.error('record goal event:', error);
    _goalAssistSaving = false;
    await _goalWriteQueue;
    const recoveryGeneration = _goalWriteGeneration;
    const freshMatches = await loadGoalMatchesSnapshot(recoveryGeneration) || [];
    const freshMatch = freshMatches.find(item => item.id === pending.mid);
    const savedEvent = freshMatch && getGoalEvents(freshMatch).find(event => event && event.id === pending.eventId);
    if (savedEvent) {
      const savedScorer = matchPlayerName(freshMatch, savedEvent.scorerId);
      const savedAssister = savedEvent.assistPlayerId ? matchPlayerName(freshMatch, savedEvent.assistPlayerId) : null;
      const detail = savedEvent.assistType === 'player' && savedAssister ? `🎯 Asistencia de ${savedAssister}` : savedEvent.assistType === 'individual' ? '⚡ Jugada individual' : '🥅 Gol de rebote';
      cancelGoalAssist(true);
      renderGoles();
      focusGoalTrigger(pending.mid, pending.scorerId);
      showToast(`⚽ Gol de ${savedScorer} · ${detail}`, 2600);
      return;
    }
    setGoalAssistError(error.message || 'No se pudo guardar. Revisá la conexión y reintentá.');
    setSaveState('⚠️ Sin guardar');
  }
}

function paintGoals(m, animKey) {
  const g = getGoals(m);
  (m.teams || []).forEach((t, i) => {
    const tot = teamGoals(m, i);
    const board = document.getElementById('gt-' + i);
    if (board) board.textContent = tot;
    const head = document.getElementById('gth-' + i);
    if (head) head.textContent = tot + (tot === 1 ? ' gol' : ' goles');
    [...(t.players || []).map(p => p.id), '__t' + i].forEach(k => {
      const c = document.getElementById('gc-' + k);
      if (!c) return;
      const n = g[k] || 0;
      c.textContent = n;
      c.classList.toggle('zero', n === 0);
      const row = c.closest('.goal-row');
      if (row) row.classList.toggle('scored', n > 0);
      if (k === animKey) {
        c.classList.remove('pop');
        void c.offsetWidth;
        c.classList.add('pop');
      }
    });
  });
}

function goalEventLineHTML(m, event, index) {
  const scorer = matchPlayerName(m, event.scorerId);
  let detail = 'Sin detalle';
  let icon = '⚪';
  if (event.assistType === 'player' && event.assistPlayerId) {
    detail = `Asistencia de ${matchPlayerName(m, event.assistPlayerId)}`;
    icon = '🎯';
  } else if (event.assistType === 'individual') {
    detail = 'Jugada individual';
    icon = '⚡';
  } else if (event.assistType === 'rebound') {
    detail = 'Rebote';
    icon = '🥅';
  } else if (event.assistType === 'unrecorded') {
    detail = 'Asistencia no registrada';
    icon = '➖';
  }
  return `<div class="goal-event-line"><span class="goal-event-number">${index + 1}</span><span><b>⚽ ${escapeHtml(scorer)}</b><small>${icon} ${escapeHtml(detail)}</small></span></div>`;
}

function renderGoles() {
  const el = document.getElementById('goles-content');
  if (!el) return;

  if (!matches.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚽</div>
      <div>Todavía no hay ningún partido guardado.</div>
      <div style="font-size:12px;margin-top:6px">Armá los equipos en 🏆 Equipos y guardá el partido para abrir la planilla.</div>
    </div>`;
    return;
  }

  const mid = getActiveMatchId();
  const m = matches.find(x => x.id === mid);
  if (!m) { el.innerHTML = `<div class="empty-state">Elegí un partido</div>`; return; }

  const isAdmin = state.currentUser && state.currentUser.isAdmin;
  const teams = m.teams || [];
  const g = getGoals(m);
  const assistsByPlayer = Object.fromEntries(matchAssisters(m).map(item => [item.id, item.assists]));

  // Selector de partido
  const opts = matches.slice(0, 12).map(mm => {
    const estado = isPlayed(mm) ? 'cerrado' : 'abierto';
    const marcador = matchHasGoals(mm) ? ' · ' + matchScoreStr(mm) : '';
    return `<option value="${mm.id}"${mm.id === mid ? ' selected' : ''}>${formatMatchDate(mm)} · ${estado}${marcador}</option>`;
  }).join('');

  let html = `<select class="goles-select" onchange="golesMatchId=this.value;renderGoles()">${opts}</select>`;

  // Marcador
  html += `<div class="score-board">`;
  teams.forEach((t, i) => {
    if (i > 0) html += `<div class="score-sep">–</div>`;
    html += `<div class="score-side">
      <div class="sname sc${i}">${TEAM_EMOJIS[i] || '⚪'} ${TEAM_NAMES[i]}</div>
      <div class="snum sc${i}" id="gt-${i}">${teamGoals(m, i)}</div>
    </div>`;
  });
  html += `</div>`;
  html += `<div class="save-state" id="goles-save-state"></div>`;

  if (isPlayed(m)) {
    const res = m.result;
    const txt = res.winner === 'draw' ? '🤝 Partido cerrado como empate' : `🏆 Partido cerrado — ganó Equipo ${TEAM_NAMES[res.winner]}`;
    html += `<div style="background:rgba(240,192,64,.08);border:1px solid rgba(240,192,64,.35);border-radius:10px;padding:9px 12px;font-size:12px;color:var(--gold);margin-bottom:12px;line-height:1.5">${txt}. Podés seguir corrigiendo goles: el resultado se actualiza solo.</div>`;
  }

  // Planillas por equipo
  teams.forEach((t, i) => {
    const tot = teamGoals(m, i);
    html += `<div class="goal-team">
      <div class="team-header ${TEAM_CLASSES[i] || 'team-a'}">
        <span>${TEAM_EMOJIS[i] || '⚪'} EQUIPO ${TEAM_NAMES[i]}</span>
        <span class="team-overall" id="gth-${i}">${tot} ${tot === 1 ? 'gol' : 'goles'}</span>
      </div>`;
    (t.players || []).forEach(p => {
      html += goalRowHTML(m.id, p.id, `${p.name}${p.isGuest ? ' 👤' : ''}`, g[p.id] || 0, false, assistsByPlayer[p.id] || 0);
    });
    html += goalRowHTML(m.id, '__t' + i, '⚪ Sin autor / en contra', g['__t' + i] || 0, true, 0);
    html += `</div>`;
  });

  const goalEvents = getGoalEvents(m);
  if (goalEvents.length) {
    html += `<section class="goal-event-log"><div class="goal-event-log-head"><span>🎯 DETALLE DE LOS GOLES</span><small>${goalEvents.length} registrado${goalEvents.length===1?'':'s'}</small></div><div class="goal-event-log-list">${goalEvents.slice().reverse().map((event, reverseIndex) => goalEventLineHTML(m, event, goalEvents.length - reverseIndex - 1)).join('')}</div></section>`;
  }

  html += `<button class="btn btn-ghost w-full" style="justify-content:center;margin-top:4px" onclick="shareMatchResult('${m.id}')">📲 Compartir marcador</button>`;

  if (isAdmin) {
    if (matchHasGoals(m)) {
      html += `<button class="btn btn-primary w-full" style="justify-content:center;margin-top:8px" onclick="closeMatchFromGoals('${m.id}')">🏁 ${isPlayed(m) ? 'Recalcular resultado con este marcador' : 'Cerrar partido con este marcador'}</button>`;
    }
    html += `<button class="btn btn-danger w-full" style="justify-content:center;margin-top:8px" onclick="resetGoals('${m.id}')">♻️ Reiniciar goles</button>`;
  }

  html += `<div class="goal-hint">Al tocar <b>+</b>, elegí quién dio la asistencia, si fue una jugada individual o un rebote.<br>Cualquiera puede cargar desde su celular y la planilla se sincroniza con el resto.</div>`;

  el.innerHTML = html;
}

function goalRowHTML(mid, key, name, n, extra, assists) {
  return `<div class="goal-row${extra ? ' extra' : ''}${n > 0 ? ' scored' : ''}">
    <span class="goal-name">${escapeHtml(name)}</span>
    ${assists ? `<span class="goal-assist-count" title="${assists} asistencia${assists===1?'':'s'} en este partido">🎯 ${assists}</span>` : ''}
    <span class="goal-count${n ? '' : ' zero'}" id="gc-${key}">${n}</span>
    <button class="goal-btn minus" data-match-id="${escapeHtml(mid)}" data-goal-key="${escapeHtml(key)}" onclick="addGoal('${mid}','${key}',-1)" aria-label="Restar gol a ${escapeHtml(name)}">−</button>
    <button class="goal-btn plus" data-match-id="${escapeHtml(mid)}" data-goal-key="${escapeHtml(key)}" onclick="addGoal('${mid}','${key}',1)" aria-label="Sumar gol a ${escapeHtml(name)}">+</button>
  </div>`;
}

async function closeMatchFromGoals(mid) {
  await reconcilePendingGoalWrites();
  const m = matches.find(x => x.id === mid);
  if (!m) return;
  const sc = matchScore(m);
  const max = Math.max(...sc);
  const ganadores = sc.filter(s => s === max).length;
  const ordenados = [...sc].sort((a, b) => b - a);

  let winner, margin = null;
  if (ganadores > 1) { winner = 'draw'; }
  else {
    winner = sc.indexOf(max);
    margin = Math.min(3, Math.max(1, max - ordenados[1]));
  }

  // MVP sugerido: máximo goleador del equipo ganador (o del partido si fue empate)
  const scorers = matchScorers(m);
  const delGanador = winner === 'draw'
    ? scorers
    : scorers.filter(s => ((m.teams||[])[winner].players||[]).some(p => p.id === s.id));
  const mvpSugerido = (m.result && m.result.mvp) || (delGanador[0] ? delGanador[0].id : null);

  const resumen = winner === 'draw'
    ? `Empate ${sc.join('–')}`
    : `Gana Equipo ${TEAM_NAMES[winner]} ${sc.join('–')} (${marginLabel(margin)})`;
  const mvpTxt = mvpSugerido ? `\n\nMVP: ${playerNameById(mvpSugerido)}` : '';
  if (!await confirmAppAction({ title: 'CERRAR PARTIDO', message: `${resumen}${mvpTxt}`, confirmText: 'Cerrar partido' })) return;

  const previousResult = JSON.parse(JSON.stringify(m.result || null));
  m.result = {
    ...(m.result || {}),
    winner,
    margin,
    mvp: mvpSugerido,
    goals: getGoals(m),
    goalsTracked: true
  };
  const saved = await upsertMatch(m);
  if (!saved) {
    const freshMatches = await loadMatches();
    if (freshMatches.length) matches = freshMatches;
    else m.result = previousResult;
    renderGoles();
    return;
  }
  renderHub();
  renderGoles();
  renderPlayers();
  const outcomeChanged = m.result?.winner !== winner || m.result?.margin !== margin;
  showToast(outcomeChanged ? '🏁 Partido cerrado con el marcador más reciente' : '🏁 Partido cerrado');
}

async function resetGoals(mid) {
  await reconcilePendingGoalWrites();
  const m = matches.find(x => x.id === mid);
  if (!m) return;
  if (!await confirmAppAction({ title: 'BORRAR GOLES Y ASISTENCIAS', message: 'Se borrarán todos los goles y todas las asistencias registradas en este partido. Esta acción no se puede deshacer.', confirmText: 'Sí, borrar', danger: true })) return;
  const previousResult = JSON.parse(JSON.stringify(m.result || null));
  if (isPlayed(m)) {
    m.result.goals = {};
    m.result.goalEvents = [];
    m.result.goalsTracked = true;
    m.result.assistsTracked = true;
  } else {
    m.result = {
      winner: null,
      margin: null,
      mvp: null,
      goals: {},
      goalEvents: [],
      goalEventMutationIds: Array.isArray(previousResult?.goalEventMutationIds) ? previousResult.goalEventMutationIds : [],
      goalsTracked: true,
      assistsTracked: true
    };
  }
  m.result.goalDataReplace = true;
  const saved = await upsertMatch(m);
  delete m.result.goalDataReplace;
  if (!saved) {
    const freshMatches = await loadMatches();
    if (freshMatches.length) matches = freshMatches;
    else m.result = previousResult;
    renderGoles();
    return;
  }
  for (const retryKey of _goalRemovalRetryIds.keys()) {
    if (retryKey.startsWith(`${mid}:`)) _goalRemovalRetryIds.delete(retryKey);
  }
  renderHub();
  renderGoles();
  renderPlayers();
  showToast('♻️ Goles y asistencias reiniciados');
}

// ============================================================
