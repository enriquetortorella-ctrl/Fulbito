// ADMIN
// ============================================================
function renderAdmin() {
  const clubInfo = document.getElementById('club-admin-info');
  if (clubInfo && state.currentClub) {
    clubInfo.innerHTML = state.currentUser?.supportMode ? `
      <div style="padding:10px 0 2px"><div style="font-weight:700">${escapeHtml(state.currentClub.name)}</div><div class="sec-note" style="margin-top:3px;color:var(--gold)">🛡️ Modo soporte maestro · código de invitación oculto</div></div>` : `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0 2px">
        <div><div style="font-weight:700">${escapeHtml(state.currentClub.name)}</div><div class="sec-note" style="margin-top:3px">Compartí el código para que entren al grupo.</div></div>
        <button class="btn btn-gold btn-sm" onclick="copyClubInviteCode()">${escapeHtml(state.currentClub.inviteCode)}</button>
      </div>`;
  }
  const list = document.getElementById('admin-players-list');
  list.innerHTML = state.players.map(p => `
    <div class="admin-player-row">
      <div style="font-size:20px">${posEmoji(getEffectivePosition(p))}</div>
      <div class="admin-player-name">${p.name} <span style="color:var(--muted);font-size:12px">@${p.username}</span>${p.isAdmin?' 👑':''}${p._resetRequested?' <span style="color:var(--red);font-size:11px">⚠️ pidió reset</span>':''}</div>
      <button class="btn-icon" title="${p.isAdmin?'Quitar admin':'Hacer admin'}" onclick="toggleAdmin('${p.id}')">${p.isAdmin?'👑':'⬜'}</button>
      <button class="btn-icon" title="Resetear contraseña a 1234" onclick="adminResetPassword('${p.id}')">🔑</button>
      <button class="btn-icon" title="Eliminar" onclick="removePlayer('${p.id}')">🗑️</button>
    </div>
  `).join('');
}

async function copyClubInviteCode() {
  const code = state.currentClub?.inviteCode;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast(`✅ Código ${code} copiado`);
  } catch {
    showToast(`Código del club: ${code}`, 4000);
  }
}

async function removePlayer(id) {
  const p = state.players.find(x=>x.id===id);
  if (!p) return;
  if (!confirm(`¿Eliminar a ${p.name}?`)) return;
  state.players = state.players.filter(x=>x.id!==id);
  await deletePlayer(id);
  renderAdmin();
  renderPlayers();
  showToast('🗑️ Jugador eliminado');
}

// ============================================================
