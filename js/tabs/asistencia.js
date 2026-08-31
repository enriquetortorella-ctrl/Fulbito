// ATTENDANCE TAB
// ============================================================
function renderAttendance() {
  const list = document.getElementById('attend-list');
  let going=0, notgoing=0, pending=0;
  state.players.forEach(p => {
    if(p.attendance==='going') going++;
    else if(p.attendance==='notgoing') notgoing++;
    else pending++;
  });
  document.getElementById('stat-going').textContent = going;
  document.getElementById('stat-notgoing').textContent = notgoing;
  document.getElementById('stat-pending').textContent = pending;

  list.innerHTML = state.players.map(p => {
    const isMe = p.id === state.currentUser.id;
    const pos = getEffectivePosition(p);
    return `<div class="attend-player" id="attend-row-${p.id}">
      <div style="font-size:20px">${posEmoji(pos)}</div>
      <div style="flex:1">
        <div class="attend-player-name">${p.name}${isMe?' <span style="color:var(--gold);font-size:11px">(yo)</span>':''}</div>
        <div class="attend-player-pos">${POS_LABELS[pos]||pos}</div>
      </div>
      <div class="attend-toggle">
        <button class="attend-btn${p.attendance==='going'?' going-active':''}" onclick="setAttendance('${p.id}','going')" title="Voy">✅</button>
        <button class="attend-btn${p.attendance==='notgoing'?' notgoing-active':''}" onclick="setAttendance('${p.id}','notgoing')" title="No voy">❌</button>
      </div>
    </div>`;
  }).join('');
}

async function setAttendance(id, val) {
  const p = state.players.find(x=>x.id===id);
  if (!p) return;
  if (p.id !== state.currentUser.id && !state.currentUser.isAdmin) {
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
  if (!state.currentUser?.isAdmin) { showToast('⚠️ Solo un admin puede borrar toda la asistencia'); return; }
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
