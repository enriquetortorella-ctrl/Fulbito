// AUTO SYNC — consulta protegida periódica. No se suscriben tablas públicas.
// ============================================================
let secureSyncTimer = null;
let secureSyncGeneration = 0;

async function startSync() {
  if (!state.currentClub?.id) return;
  stopSync();
  const clubId = state.currentClub.id;
  const syncGeneration = secureSyncGeneration;
  const sync = async () => {
    if (secureSyncGeneration !== syncGeneration || state.currentClub?.id !== clubId || _goalSaveTimer || _goalWritesPending > 0) return;
    const goalWriteGeneration = _goalWriteGeneration;
    const goalReadGeneration = ++_goalReadGeneration;
    const [freshPlayers, freshMatches, freshClub] = await Promise.all([
      loadPlayers(clubId),
      loadMatches(clubId),
      loadClubBrand(clubId)
    ]);
    if (secureSyncGeneration !== syncGeneration ||
        state.currentClub?.id !== clubId ||
        goalWriteGeneration !== _goalWriteGeneration ||
        goalReadGeneration !== _goalReadGeneration ||
        _goalSaveTimer || _goalWritesPending > 0) return;
    if (!freshPlayers.length && state.players.length) return;
    state.players = freshPlayers;
    if (freshMatches.length || !matches.length) matches = freshMatches;
    const clubChanged = freshClub && (
      freshClub.name !== state.currentClub.name ||
      freshClub.crest !== state.currentClub.crest ||
      !sameClubCrestDesign(freshClub.crestDesign, state.currentClub.crestDesign) ||
      freshClub.matchWeekday !== state.currentClub.matchWeekday ||
      freshClub.matchTime !== state.currentClub.matchTime ||
      freshClub.matchVenue !== state.currentClub.matchVenue ||
      freshClub.matchAddress !== state.currentClub.matchAddress ||
      (state.currentUser?.isAdmin && freshClub.inviteCode !== state.currentClub.inviteCode)
    );
    if (clubChanged) {
      state.currentClub = { ...state.currentClub, ...freshClub };
      SESSION.set({ ...state.currentUser, clubName: freshClub.name, clubCrest: freshClub.crest || null, clubCrestDesign: freshClub.crestDesign || null, clubInviteCode: state.currentUser.isAdmin ? freshClub.inviteCode || null : null, clubMatchWeekday: freshClub.matchWeekday, clubMatchTime: freshClub.matchTime, clubMatchVenue: freshClub.matchVenue, clubMatchAddress: freshClub.matchAddress });
      renderClubIdentity();
    }
    const tabName = getActiveTabName();
    if (tabName==='inicio') renderHub();
    if (tabName==='jugadores') renderPlayers();
    if (tabName==='asistencia') renderAttendance();
    if (tabName==='admin') renderAdmin();
    if (tabName==='partidos') renderPartidos();
    if (tabName==='goleadores') renderGoleadoresTab();
    if (tabName==='posiciones') renderRanking();
    if (tabName==='stats') renderStats();
    if (tabName==='goles') renderGoles();
    const dot = document.getElementById('conn-dot');
    if (dot) dot.textContent = '🟢';
  };
  secureSyncTimer = window.setInterval(sync, 30000);
  const dot = document.getElementById('conn-dot');
  if (dot) dot.textContent = '🟢';
}

function stopSync() {
  secureSyncGeneration++;
  if (secureSyncTimer) window.clearInterval(secureSyncTimer);
  secureSyncTimer = null;
}

// ============================================================
// KEYBOARD SHORTCUT
// ============================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('modal-goal-assist')?.classList.contains('open')) {
      cancelGoalAssist();
      return;
    }
    if (document.getElementById('modal-action-confirm')?.classList.contains('open')) {
      cancelAppActionConfirmation();
      return;
    }
    document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
  }
});

// ============================================================
