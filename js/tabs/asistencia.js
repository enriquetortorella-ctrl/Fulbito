// ATTENDANCE TAB
// ============================================================
let attendanceRetryPending = false;

function attendanceRosterReady() {
  if (!state.currentUser) return false;
  if (state.currentUser.supportMode) return true;
  return state.players.some(player => player.id === state.currentUser.id);
}

function renderAttendance() {
  const list = document.getElementById('attend-list');
  if (!list) return;
  const rosterReady = attendanceRosterReady();
  const clearAllButton = document.getElementById('attendance-clear-all');
  if (clearAllButton) clearAllButton.hidden = !rosterReady || !(typeof canRunClubBulkActions === 'function' ? canRunClubBulkActions() : state.currentUser?.isAdmin);
  let going=0, notgoing=0, pending=0;
  state.players.forEach(p => {
    if(p.attendance==='going') going++;
    else if(p.attendance==='notgoing') notgoing++;
    else pending++;
  });
  document.getElementById('stat-going').textContent = rosterReady ? going : '—';
  document.getElementById('stat-notgoing').textContent = rosterReady ? notgoing : '—';
  document.getElementById('stat-pending').textContent = rosterReady ? pending : '—';

  if (!rosterReady) {
    list.innerHTML = `<div class="attendance-load-state" role="status" aria-live="polite"><div aria-hidden="true">↻</div><strong>No pudimos cargar el plantel</strong><span>La confirmación queda bloqueada para no guardar una respuesta sobre datos incompletos.</span><button type="button" class="btn btn-primary btn-sm" onclick="retryAttendancePlayers(this)">Reintentar carga</button></div>`;
    return;
  }

  if (!state.players.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><div>Este club todavía no tiene jugadores.</div></div>';
    return;
  }

  list.innerHTML = state.players.map(p => {
    const isMe = p.id === state.currentUser?.id;
    const canEdit = isMe || !!state.currentUser?.isAdmin;
    const pos = getEffectivePosition(p);
    return `<div class="attend-player" id="attend-row-${p.id}">
      <div style="font-size:20px">${posEmoji(pos)}</div>
      <div style="flex:1">
        <div class="attend-player-name">${escapeHtml(p.name)}${isMe?' <span style="color:var(--gold);font-size:11px">(yo)</span>':''}</div>
        <div class="attend-player-pos">${escapeHtml(POS_LABELS[pos]||pos)}</div>
      </div>
      <div class="attend-toggle">
        <button type="button" class="attend-btn${p.attendance==='going'?' going-active':''}" onclick="setAttendance('${p.id}','going')" aria-label="${canEdit ? `Marcar que ${escapeHtml(p.name)} va` : `No podés editar la asistencia de ${escapeHtml(p.name)}`}" aria-pressed="${p.attendance==='going'}" title="${canEdit?'Voy':'Solo el jugador o un administrador puede editar'}"${canEdit?'':' disabled'}>✅</button>
        <button type="button" class="attend-btn${p.attendance==='notgoing'?' notgoing-active':''}" onclick="setAttendance('${p.id}','notgoing')" aria-label="${canEdit ? `Marcar que ${escapeHtml(p.name)} no va` : `No podés editar la asistencia de ${escapeHtml(p.name)}`}" aria-pressed="${p.attendance==='notgoing'}" title="${canEdit?'No voy':'Solo el jugador o un administrador puede editar'}"${canEdit?'':' disabled'}>❌</button>
      </div>
    </div>`;
  }).join('');
}

async function retryAttendancePlayers(button) {
  if (attendanceRetryPending) return;
  attendanceRetryPending = true;
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Cargando…';
  }
  try {
    await refreshPlayers();
  } finally {
    attendanceRetryPending = false;
    if (button?.isConnected) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'Reintentar carga';
    }
  }
}

async function setAttendance(id, val) {
  const p = state.players.find(x=>x.id===id);
  if (!p) {
    showToast('⚠️ El plantel no está disponible. Reintentá la carga antes de confirmar.');
    renderAttendance();
    return;
  }
  if (p.id !== state.currentUser?.id && !state.currentUser?.isAdmin) {
    showToast('⚠️ Solo podés marcar tu propia asistencia');
    return;
  }
  const nextValue = p.attendance === val ? null : val;
  try {
    await callRpc('fulbito_set_attendance', {
      p_club_id: state.currentClub.id,
      p_player_id: id,
      p_attendance: nextValue
    });
    p.attendance = nextValue;
    renderHub();
    renderAttendance();
  } catch (error) { showToast(`❌ ${error.message}`); }
}

async function clearAllAttendance() {
  if (!(typeof canRunClubBulkActions === 'function' ? canRunClubBulkActions() : state.currentUser?.isAdmin)) { showToast('⚠️ Solo un admin puede borrar toda la asistencia'); return; }
  if (!await confirmAppAction({ title: 'BORRAR ASISTENCIA', message: 'Se borrará toda la asistencia registrada del club. Esta acción no se puede deshacer.', confirmText: 'Sí, borrar', danger: true })) return;
  try {
    await callRpc('fulbito_clear_attendance', { p_club_id: state.currentClub.id });
    state.players.forEach(p => p.attendance = null);
    renderHub();
    renderAttendance();
    showToast('🗑️ Asistencia borrada');
  } catch (error) { showToast(`❌ ${error.message}`); }
}

function resetAllAttendance() { clearAllAttendance(); }

// ============================================================
