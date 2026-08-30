// CENTRO DE SOPORTE MAESTRO
// ============================================================
async function openPlatformAdmin() {
  if (!state.currentUser?.isPlatformAdmin) return;
  const root = document.getElementById('modal-platform-admin-content');
  root.innerHTML = '<div class="empty-state">⏳ Cargando clubes disponibles...</div>';
  openModal('modal-platform-admin');
  try {
    const clubs = await callRpc('fulbito_platform_list_clubs');
    state.platformClubs = Array.isArray(clubs) ? clubs : [];
    root.innerHTML = `
      <div style="background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.3);border-radius:10px;padding:12px 14px;margin-bottom:14px;color:var(--text);font-size:13px;line-height:1.5">
        <b style="color:var(--gold)">Acceso maestro</b> · Elegí un club para asistirlo. Podés administrar plantel, asistencia y partidos; las votaciones quedan bloqueadas para preservar la autoría de cada jugador.
      </div>
      <div style="display:grid;gap:9px;max-height:50vh;overflow:auto;padding-right:3px">
        ${state.platformClubs.map(club => `<button class="club-card" type="button" onclick="enterSupportClub('${safePlainText(club.id, 90)}')" style="width:100%;text-align:left">
          <span class="club-card-crest">${escapeHtml((club.name || 'FC').slice(0,2).toUpperCase())}</span>
          <span class="club-card-copy"><span class="club-card-name">${escapeHtml(club.name)}</span><span class="club-card-meta">${Number(club.players_count)||0} jugadores · ${Number(club.admins_count)||0} admin${Number(club.admins_count)===1?'':'s'}</span></span>
          <span class="club-card-arrow">›</span>
        </button>`).join('') || '<div class="empty-state">No hay clubes para mostrar.</div>'}
      </div>`;
  } catch (error) {
    root.innerHTML = `<div class="empty-state">No se pudo abrir el centro de soporte: ${escapeHtml(error.message || 'sin acceso')}</div>`;
  }
}

async function enterSupportClub(clubId) {
  if (!state.currentUser?.isPlatformAdmin) return;
  const club = state.platformClubs.find(item => item.id === clubId);
  if (!club) { showToast('❌ No encontramos ese club'); return; }
  if (!state.supportMode) {
    state.supportHome = { club: { ...state.currentClub }, user: { ...state.currentUser } };
  }
  state.currentClub = { id: club.id, name: safePlainText(club.name, 50) || 'Club', inviteCode: null };
  state.currentUser = { ...state.currentUser, name: 'Soporte maestro', isAdmin: true, supportMode: true, clubId: club.id };
  state.supportMode = true;
  state.builtTeams = null;
  closeModal('modal-platform-admin');
  showToast('⏳ Abriendo modo soporte...');
  const [players, savedMatches] = await Promise.all([loadPlayers(club.id), loadMatches(club.id)]);
  state.players = players;
  matches = savedMatches;
  showApp();
  showToast(`🛡️ Modo soporte: ${state.currentClub.name}`);
}

async function exitSupportMode() {
  const home = state.supportHome;
  if (!home) { showClubChooser(); return; }
  state.currentClub = { ...home.club };
  state.currentUser = { ...home.user, supportMode: false };
  state.supportMode = false;
  state.supportHome = null;
  state.builtTeams = null;
  const [players, savedMatches] = await Promise.all([loadPlayers(home.club.id), loadMatches(home.club.id)]);
  state.players = players;
  matches = savedMatches;
  showApp();
  showToast('🏟️ Volviste a tu club');
}

// ============================================================
