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
    if (secureSyncGeneration !== syncGeneration || state.currentClub?.id !== clubId || _goalSaveTimer || _goalWritesPending > 0 ||
        (typeof _ratingWritesPending === 'number' && _ratingWritesPending > 0) ||
        (typeof _appMutationsPending === 'number' && _appMutationsPending > 0)) return;
    const goalWriteGeneration = _goalWriteGeneration;
    const ratingWriteGeneration = typeof _ratingWriteGeneration === 'number' ? _ratingWriteGeneration : null;
    const appMutationBarrier = typeof captureAppMutationBarrier === 'function'
      ? captureAppMutationBarrier()
      : null;
    const goalReadGeneration = ++_goalReadGeneration;
    const accessRead = state.currentUser?.supportMode || typeof loadCurrentPlayerAccess !== 'function'
      ? Promise.resolve(null)
      : loadCurrentPlayerAccess(clubId);
    const [freshPlayers, freshMatches, freshClub, accessSnapshot] = await Promise.all([
      loadPlayers(clubId),
      loadMatches(clubId),
      loadClubBrand(clubId),
      accessRead
    ]);
    if (secureSyncGeneration !== syncGeneration ||
        state.currentClub?.id !== clubId ||
        goalWriteGeneration !== _goalWriteGeneration ||
        (ratingWriteGeneration !== null && ratingWriteGeneration !== _ratingWriteGeneration) ||
        (appMutationBarrier && typeof isAppMutationBarrierCurrent === 'function' &&
          !isAppMutationBarrierCurrent(appMutationBarrier)) ||
        goalReadGeneration !== _goalReadGeneration ||
        _goalSaveTimer || _goalWritesPending > 0 ||
        (typeof _ratingWritesPending === 'number' && _ratingWritesPending > 0) ||
        (typeof _appMutationsPending === 'number' && _appMutationsPending > 0)) return;
    // Cada recurso se actualiza de manera independiente: una falla leyendo el
    // plantel no debe impedir que lleguen partidos o cambios de identidad. Una
    // lista vacía válida, en cambio, sí limpia el plantel mostrado.
    if (freshPlayers !== null) state.players = freshPlayers;
    if (typeof reconcileCurrentUserAccess === 'function' &&
        !reconcileCurrentUserAccess(freshPlayers, accessSnapshot)) return;
    if (freshMatches !== null) matches = freshMatches;
    const nextClub = typeof clubSnapshotForCurrentContext === 'function'
      ? clubSnapshotForCurrentContext(freshClub)
      : (freshClub && state.currentUser?.supportMode && !freshClub.inviteCode && state.currentClub?.inviteCode
        ? { ...freshClub, inviteCode: state.currentClub.inviteCode }
        : freshClub);
    const clubChanged = nextClub && (
      nextClub.name !== state.currentClub.name ||
      nextClub.crest !== state.currentClub.crest ||
      !sameClubCrestDesign(nextClub.crestDesign, state.currentClub.crestDesign) ||
      nextClub.matchWeekday !== state.currentClub.matchWeekday ||
      nextClub.matchTime !== state.currentClub.matchTime ||
      nextClub.matchVenue !== state.currentClub.matchVenue ||
      nextClub.matchAddress !== state.currentClub.matchAddress ||
      (state.currentUser?.isAdmin && nextClub.inviteCode !== state.currentClub.inviteCode)
    );
    if (clubChanged) {
      state.currentClub = { ...state.currentClub, ...nextClub };
      const shouldPersistSession = typeof shouldPersistCurrentSession === 'function'
        ? shouldPersistCurrentSession()
        : !state.currentUser?.supportMode;
      if (shouldPersistSession) {
        SESSION.set({ ...state.currentUser, clubName: nextClub.name, clubCrest: nextClub.crest || null, clubCrestDesign: nextClub.crestDesign || null, clubInviteCode: state.currentUser.isAdmin ? nextClub.inviteCode || null : null, clubMatchWeekday: nextClub.matchWeekday, clubMatchTime: nextClub.matchTime, clubMatchVenue: nextClub.matchVenue, clubMatchAddress: nextClub.matchAddress });
      }
      renderClubIdentity();
    }
    const tabName = getActiveTabName();
    if (tabName==='inicio') renderHub();
    if (tabName==='jugadores') renderPlayers();
    if (tabName==='asistencia') renderAttendance();
    if (tabName==='calificar') renderRate();
    // No reemplazar los inputs del administrador a mitad de una edición. El
    // estado remoto sí se actualiza y se renderizará al guardar/cancelar o al
    // volver a abrir la pestaña.
    if (tabName==='admin' && !(typeof isAdminEditingDraft === 'function' && isAdminEditingDraft())) renderAdmin();
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
    if (document.getElementById('modal-club-confirm')?.classList.contains('open')) {
      cancelClubConfirmation();
      return;
    }
    if (document.getElementById('modal-admin-password')?.classList.contains('open')) {
      cancelAdminPasswordDialog();
      return;
    }
    if (document.getElementById('modal-delete-player')?.classList.contains('open')) {
      cancelPlayerRemoval();
      return;
    }
    if (document.getElementById('modal-crest-designer')?.classList.contains('open')) {
      toggleClubCrestDesigner(false);
      return;
    }
    document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
  }
});

// ============================================================
