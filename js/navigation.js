// SCREENS & TABS
// ============================================================
const TAB_ORDER = ['inicio','jugadores','asistencia','calificar','equipos','goles','partidos','goleadores','posiciones','stats','admin'];

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showApp() {
  if (!state.currentClub || !state.currentUser) { showClubChooser(); return; }
  showScreen('screen-app');
  startSync();
  const isSupport = !!state.currentUser.supportMode;
  document.getElementById('topbar-username').textContent = isSupport ? 'Soporte maestro' : state.currentUser.name;
  document.getElementById('club-caption').textContent = state.currentClub.name.toUpperCase();
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
  loadMatches().then(m => {
    matches = m;
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
