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
        <b style="color:var(--gold)">Acceso maestro</b> · Elegí un club para asistirlo. En modo soporte podés corregir asistencia, planillas y resultados, y ejecutar los borrados masivos disponibles. La identidad, el código, las cuentas y la emisión de votos quedan en modo lectura.
      </div>
      <div style="display:grid;gap:9px;max-height:50vh;overflow:auto;padding-right:3px">
        ${state.platformClubs.map(club => `<div class="club-card" style="width:100%;display:flex;align-items:center;gap:10px">
          <button type="button" onclick="enterSupportClub('${safePlainText(club.id, 90)}')" style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;background:none;border:0;padding:0;color:inherit;text-align:left;cursor:pointer">
            <span class="club-card-crest">${escapeHtml((club.name || 'FC').slice(0,2).toUpperCase())}</span>
            <span class="club-card-copy"><span class="club-card-name">${escapeHtml(club.name)}</span><span class="club-card-meta">${Number(club.players_count)||0} jugadores · ${Number(club.admins_count)||0} admin${Number(club.admins_count)===1?'':'s'} · código ${escapeHtml(club.invite_code || '—')}</span></span>
            <span class="club-card-arrow">›</span>
          </button>
          <button class="btn btn-danger btn-sm" type="button" title="Eliminar club completo" onclick="removePlatformClub('${safePlainText(club.id, 90)}')">🗑️</button>
        </div>`).join('') || '<div class="empty-state">No hay clubes para mostrar.</div>'}
      </div>`;
  } catch (error) {
    root.innerHTML = `<div class="empty-state">No se pudo abrir el centro de soporte: ${escapeHtml(error.message || 'sin acceso')}</div>`;
  }
}

async function removePlatformClub(clubId) {
  if (!state.currentUser?.isPlatformAdmin) return;
  const club = state.platformClubs.find(item => item.id === clubId);
  if (!club) { showToast('❌ No encontramos ese club'); return; }
  const summary = `${Number(club.players_count)||0} jugador${Number(club.players_count)===1?'':'es'} y todos sus partidos serán eliminados.`;
  if (!await confirmAppAction({
    title: 'ELIMINAR CLUB COMPLETO',
    message: `Vas a eliminar “${club.name}”. ${summary}\n\nEsta acción no se puede deshacer.`,
    confirmText: 'Sí, eliminar club',
    danger: true
  })) return;
  try {
    await deletePlatformClub(clubId);
    state.platformClubs = state.platformClubs.filter(item => item.id !== clubId);
    showToast(`🗑️ Club “${club.name}” eliminado`);
    await openPlatformAdmin();
  } catch (error) {
    showToast(`❌ ${error.message || 'No se pudo eliminar el club.'}`);
  }
}

async function enterSupportClub(clubId) {
  if (!state.currentUser?.isPlatformAdmin) return;
  const club = state.platformClubs.find(item => item.id === clubId);
  if (!club) { showToast('❌ No encontramos ese club'); return; }
  if (!state.supportMode) {
    state.supportHome = { club: { ...state.currentClub }, user: { ...state.currentUser } };
  }
  resetTeamDraftState();
  state.currentClub = {
    id: club.id,
    name: safePlainText(club.name, 50) || 'Club',
    crest: safeClubCrestUrl(club.crest),
    inviteCode: safePlainText(club.invite_code, 24) || null
  };
  state.currentUser = { ...state.currentUser, name: 'Soporte maestro', isAdmin: true, supportMode: true, clubId: club.id };
  state.supportMode = true;
  closeModal('modal-platform-admin');
  showToast('⏳ Abriendo modo soporte...');
  const [players, savedMatches] = await Promise.all([loadPlayers(club.id), loadMatches(club.id)]);
  state.players = players === null ? [] : players;
  // Nunca mezclar la caché del club anterior al cambiar de contexto.
  matches = savedMatches === null ? [] : savedMatches;
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
  resetTeamDraftState();
  const [players, savedMatches] = await Promise.all([loadPlayers(home.club.id), loadMatches(home.club.id)]);
  state.players = players === null ? [] : players;
  matches = savedMatches === null ? [] : savedMatches;
  showApp();
  showToast('🏟️ Volviste a tu club');
}

// ============================================================
