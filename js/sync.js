// AUTO SYNC — consulta protegida periódica. No se suscriben tablas públicas.
// ============================================================
let secureSyncTimer = null;

async function startSync() {
  if (!state.currentClub?.id) return;
  stopSync();
  const sync = async () => {
    if (!state.currentClub?.id || _goalSaveTimer) return;
    const [freshPlayers, freshMatches, freshClub] = await Promise.all([loadPlayers(), loadMatches(), loadClubBrand()]);
    if (!freshPlayers.length && state.players.length) return;
    state.players = freshPlayers;
    matches = freshMatches;
    if (freshClub && (freshClub.name !== state.currentClub.name || freshClub.crest !== state.currentClub.crest)) {
      state.currentClub = { ...state.currentClub, ...freshClub };
      SESSION.set({ ...state.currentUser, clubName: freshClub.name, clubCrest: freshClub.crest || null });
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
  if (secureSyncTimer) window.clearInterval(secureSyncTimer);
  secureSyncTimer = null;
}

// ============================================================
// KEYBOARD SHORTCUT
// ============================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// ============================================================
