// SCREENS & TABS
// ============================================================
const TAB_ORDER = ['inicio','jugadores','asistencia','calificar','equipos','goles','partidos','goleadores','posiciones','stats','admin'];
let appClubReadGeneration = 0;

function beginAppClubRead() {
  const clubId = state.currentClub?.id || null;
  const generation = ++appClubReadGeneration;
  const goalReadGeneration = typeof _goalReadGeneration === 'number'
    ? ++_goalReadGeneration
    : null;
  const goalWriteGeneration = typeof _goalWriteGeneration === 'number'
    ? _goalWriteGeneration
    : null;
  const goalWritesWerePending = typeof _goalWritesPending === 'number' && _goalWritesPending > 0;
  const goalRefreshWasPending = typeof _goalSaveTimer !== 'undefined' && !!_goalSaveTimer;
  return { clubId, generation, goalReadGeneration, goalWriteGeneration, goalWritesWerePending, goalRefreshWasPending };
}

function isCurrentAppClubRead(token, { checkGoals = false } = {}) {
  if (!token?.clubId || state.currentClub?.id !== token.clubId || token.generation !== appClubReadGeneration) return false;
  if (!checkGoals) return true;
  if (token.goalWritesWerePending || token.goalRefreshWasPending) return false;
  if (typeof _goalReadGeneration === 'number' && token.goalReadGeneration !== _goalReadGeneration) return false;
  if (typeof _goalWriteGeneration === 'number' && token.goalWriteGeneration !== _goalWriteGeneration) return false;
  if (typeof _goalWritesPending === 'number' && _goalWritesPending > 0) return false;
  if (typeof _goalSaveTimer !== 'undefined' && _goalSaveTimer) return false;
  return true;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showApp() {
  if (!state.currentClub || !state.currentUser) { showClubChooser(); return; }
  const readToken = beginAppClubRead();
  showScreen('screen-app');
  startSync();
  const isSupport = !!state.currentUser.supportMode;
  document.getElementById('topbar-username').textContent = isSupport ? 'Soporte maestro' : state.currentUser.name;
  renderClubIdentity();
  const switcher = document.getElementById('topbar-club-switch');
  switcher.textContent = isSupport ? '← Mi club' : `🏟️ ${state.currentClub.name}`;
  switcher.title = isSupport ? 'Volver a mi club' : 'Cambiar club';
  switcher.onclick = isSupport ? exitSupportMode : showClubChooser;
  const masterButton = document.getElementById('platform-admin-launch');
  masterButton.style.display = state.currentUser.isPlatformAdmin ? 'inline-flex' : 'none';
  const profileButton = document.getElementById('edit-profile-button');
  if (profileButton) profileButton.style.display = isSupport ? 'none' : '';
  const wrap = document.getElementById('topbar-avatar-wrap');
  const me = getMe();
  const avatarUrl = safePhotoUrl(me?.photo);
  if (avatarUrl) {
    wrap.innerHTML = `<img class="topbar-avatar" src="${escapeHtml(avatarUrl)}" alt="">`;
  } else {
    wrap.innerHTML = `<div class="topbar-avatar-placeholder">👤</div>`;
  }
  if (state.currentUser.isAdmin) {
    document.getElementById('admin-tab').style.display='flex';
  } else {
    document.getElementById('admin-tab').style.display='none';
  }
  // La identidad se consulta en el servidor al abrir el club para que un cambio
  // hecho por otro admin aparezca incluso antes del siguiente auto-sync.
  loadClubBrand(readToken.clubId).then(freshClub => {
    if (!isCurrentAppClubRead(readToken) || !freshClub || freshClub.id !== readToken.clubId) return;
    const sameIdentity = freshClub.name === state.currentClub.name &&
      freshClub.crest === state.currentClub.crest &&
      sameClubCrestDesign(freshClub.crestDesign, state.currentClub.crestDesign);
    const sameInviteCode = !state.currentUser?.isAdmin || freshClub.inviteCode === state.currentClub.inviteCode;
    const sameSchedule = freshClub.matchWeekday === state.currentClub.matchWeekday &&
      freshClub.matchTime === state.currentClub.matchTime &&
      freshClub.matchVenue === state.currentClub.matchVenue &&
      freshClub.matchAddress === state.currentClub.matchAddress;
    if (sameIdentity && sameInviteCode && sameSchedule) return;
    state.currentClub = { ...state.currentClub, ...freshClub };
    SESSION.set({ ...state.currentUser, clubName: freshClub.name, clubCrest: freshClub.crest || null, clubCrestDesign: freshClub.crestDesign || null, clubInviteCode: state.currentUser.isAdmin ? freshClub.inviteCode || null : null, clubMatchWeekday: freshClub.matchWeekday, clubMatchTime: freshClub.matchTime, clubMatchVenue: freshClub.matchVenue, clubMatchAddress: freshClub.matchAddress });
    renderClubIdentity();
    renderHub();
    if (getActiveTabName() === 'admin') renderAdmin();
  });
  loadMatches(readToken.clubId).then(m => {
    if (!isCurrentAppClubRead(readToken, { checkGoals: true })) return;
    if (m.length || !matches.length) matches = m;
    renderPlayers();
    renderHub();
    const tab = getActiveTabName();
    if (tab === 'partidos') renderPartidos();
    if (tab === 'goleadores') renderGoleadoresTab();
    if (tab === 'posiciones') renderRanking();
    if (tab === 'stats') renderStats();
    if (tab === 'goles') renderGoles();
  });
  renderAll();
}

function renderClubIdentity() {
  if (!state.currentClub) return;
  const crest = document.getElementById('brand-crest');
  const caption = document.getElementById('club-caption');
  const switcher = document.getElementById('topbar-club-switch');
  const imageUrl = safeClubCrestUrl(state.currentClub.crest);
  if (caption) caption.textContent = state.currentClub.name.toUpperCase();
  if (switcher) {
    const isSupport = !!state.currentUser?.supportMode;
    switcher.textContent = isSupport ? '← Mi club' : `🏟️ ${state.currentClub.name}`;
    switcher.title = isSupport ? 'Volver a mi club' : `Club: ${state.currentClub.name}`;
  }
  if (!crest) return;
  crest.classList.toggle('has-custom-crest', !!imageUrl);
  crest.innerHTML = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="Escudo de ${escapeHtml(state.currentClub.name)}">`
    : escapeHtml(clubInitials(state.currentClub.name));
}

function getActiveTabName() {
  const activeTab = document.querySelector('.nav-tab.active');
  return activeTab?.getAttribute('onclick')?.match(/'(\w+)'/)?.[1] || 'inicio';
}

function switchTab(name) {
  document.querySelectorAll('.nav-tab').forEach((t,i) => {
    t.classList.toggle('active', TAB_ORDER[i]===name);
  });
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  if(name==='inicio') renderHub();
  if(name==='jugadores') renderPlayers();
  if(name==='asistencia') renderAttendance();
  if(name==='calificar') renderRate();
  if(name==='equipos') renderTeamsTab();
  if(name==='goles') renderGoles();
  if(name==='partidos') renderPartidos();
  if(name==='goleadores') renderGoleadoresTab();
  if(name==='posiciones') renderRanking();
  if(name==='stats') renderStats();
  if(name==='admin') renderAdmin();
}

// ============================================================
// HELPERS
// ============================================================
function getMe() { return state.players.find(p => p.id === state.currentUser?.id); }

// ============================================================
