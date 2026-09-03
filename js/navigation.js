// SCREENS & TABS
// ============================================================
const TAB_ORDER = ['inicio','jugadores','asistencia','calificar','equipos','goles','partidos','goleadores','posiciones','stats','admin'];
let appClubReadGeneration = 0;

function beginAppClubRead() {
  const clubId = state.currentClub?.id || null;
  const generation = ++appClubReadGeneration;
  const appMutationBarrier = typeof captureAppMutationBarrier === 'function'
    ? captureAppMutationBarrier()
    : null;
  const goalReadGeneration = typeof _goalReadGeneration === 'number'
    ? ++_goalReadGeneration
    : null;
  const goalWriteGeneration = typeof _goalWriteGeneration === 'number'
    ? _goalWriteGeneration
    : null;
  const goalWritesWerePending = typeof _goalWritesPending === 'number' && _goalWritesPending > 0;
  const goalRefreshWasPending = typeof _goalSaveTimer !== 'undefined' && !!_goalSaveTimer;
  return { clubId, generation, appMutationBarrier, goalReadGeneration, goalWriteGeneration, goalWritesWerePending, goalRefreshWasPending };
}

function isCurrentAppClubRead(token, { checkGoals = false } = {}) {
  if (!token?.clubId || state.currentClub?.id !== token.clubId || token.generation !== appClubReadGeneration) return false;
  if (token.appMutationBarrier && typeof isAppMutationBarrierCurrent === 'function' &&
      !isAppMutationBarrierCurrent(token.appMutationBarrier)) return false;
  if (!checkGoals) return true;
  if (token.goalWritesWerePending || token.goalRefreshWasPending) return false;
  if (typeof _goalReadGeneration === 'number' && token.goalReadGeneration !== _goalReadGeneration) return false;
  if (typeof _goalWriteGeneration === 'number' && token.goalWriteGeneration !== _goalWriteGeneration) return false;
  if (typeof _goalWritesPending === 'number' && _goalWritesPending > 0) return false;
  if (typeof _goalSaveTimer !== 'undefined' && _goalSaveTimer) return false;
  return true;
}

function clubSnapshotForCurrentContext(freshClub) {
  if (!freshClub) return freshClub;
  // El maestro obtiene el código desde el listado privado de soporte. Si la
  // lectura común de marca no lo expone, ese null no debe borrar el código ya
  // autorizado que necesita mostrar en Admin (sólo lectura).
  if (state.currentUser?.supportMode && !freshClub.inviteCode && state.currentClub?.inviteCode) {
    return { ...freshClub, inviteCode: state.currentClub.inviteCode };
  }
  return freshClub;
}

function shouldPersistCurrentSession() {
  return !state.currentUser?.supportMode;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showApp() {
  if (!state.currentClub || !state.currentUser) { showClubChooser(); return; }
  const readToken = beginAppClubRead();
  showScreen('screen-app');
  // Cada sesión/club abre en Inicio. Evita que una pestaña Admin activa y su
  // contenido queden visibles al ingresar luego con un usuario sin permisos.
  switchTab('inicio');
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
    document.getElementById('admin-tab').style.display='';
  } else {
    document.getElementById('admin-tab').style.display='none';
  }
  // La identidad se consulta en el servidor al abrir el club para que un cambio
  // hecho por otro admin aparezca incluso antes del siguiente auto-sync.
  loadClubBrand(readToken.clubId).then(freshClub => {
    if (!isCurrentAppClubRead(readToken) || !freshClub || freshClub.id !== readToken.clubId) return;
    const nextClub = clubSnapshotForCurrentContext(freshClub);
    const sameIdentity = nextClub.name === state.currentClub.name &&
      nextClub.crest === state.currentClub.crest &&
      sameClubCrestDesign(nextClub.crestDesign, state.currentClub.crestDesign);
    const sameInviteCode = !state.currentUser?.isAdmin || nextClub.inviteCode === state.currentClub.inviteCode;
    const sameSchedule = nextClub.matchWeekday === state.currentClub.matchWeekday &&
      nextClub.matchTime === state.currentClub.matchTime &&
      nextClub.matchVenue === state.currentClub.matchVenue &&
      nextClub.matchAddress === state.currentClub.matchAddress;
    if (sameIdentity && sameInviteCode && sameSchedule) return;
    state.currentClub = { ...state.currentClub, ...nextClub };
    // El modo soporte es temporal: nunca reemplaza la sesión persistida del
    // club propio del maestro.
    if (shouldPersistCurrentSession()) {
      SESSION.set({ ...state.currentUser, clubName: nextClub.name, clubCrest: nextClub.crest || null, clubCrestDesign: nextClub.crestDesign || null, clubInviteCode: state.currentUser.isAdmin ? nextClub.inviteCode || null : null, clubMatchWeekday: nextClub.matchWeekday, clubMatchTime: nextClub.matchTime, clubMatchVenue: nextClub.matchVenue, clubMatchAddress: nextClub.matchAddress });
    }
    renderClubIdentity();
    renderHub();
    if (getActiveTabName() === 'admin') renderAdmin();
  });
  loadMatches(readToken.clubId).then(m => {
    if (!isCurrentAppClubRead(readToken, { checkGoals: true })) return;
    if (m === null) return;
    // Una respuesta vacía válida debe limpiar una caché anterior. Sólo `null`
    // representa un error de lectura y conserva lo que ya estaba en pantalla.
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

function renderClubIdentity() {
  if (!state.currentClub) return;
  const crest = document.getElementById('brand-crest');
  const caption = document.getElementById('club-caption');
  const rosterKicker = document.getElementById('roster-club-kicker');
  const switcher = document.getElementById('topbar-club-switch');
  const imageUrl = safeClubCrestUrl(state.currentClub.crest);
  if (caption) caption.textContent = state.currentClub.name.toUpperCase();
  if (rosterKicker) {
    const schedule = typeof getClubMatchSchedule === 'function' ? getClubMatchSchedule(state.currentClub) : null;
    const weekday = schedule && typeof CLUB_WEEKDAYS !== 'undefined' ? CLUB_WEEKDAYS[schedule.weekday] : '';
    rosterKicker.textContent = schedule && weekday
      ? `${state.currentClub.name.toUpperCase()} · ${weekday.toUpperCase()} ${schedule.time}`
      : `${state.currentClub.name.toUpperCase()} · PLANTEL`;
  }
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
  return tabNameFromElement(activeTab) || 'inicio';
}

function tabNameFromElement(tab) {
  return tab?.dataset?.tab || tab?.getAttribute?.('data-tab') || tab?.getAttribute?.('onclick')?.match(/'(\w+)'/)?.[1] || '';
}

function handleTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(document.querySelectorAll('.nav-tab')).filter(tab =>
    !tab.hidden && tab.style?.display !== 'none' && tab.getAttribute?.('aria-disabled') !== 'true'
  );
  if (!tabs.length) return;
  const current = Math.max(0, tabs.indexOf(event.currentTarget));
  const nextIndex = event.key === 'Home' ? 0
    : event.key === 'End' ? tabs.length - 1
    : event.key === 'ArrowRight' ? (current + 1) % tabs.length
    : (current - 1 + tabs.length) % tabs.length;
  const next = tabs[nextIndex];
  const name = tabNameFromElement(next);
  if (!name) return;
  event.preventDefault();
  switchTab(name);
  next.focus?.();
}

function handleClickableKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.currentTarget?.click?.();
}

function openProfileFromElement(element) {
  const playerId = element?.dataset?.playerId;
  if (playerId) openPlayerProfile(playerId);
}

function profileRowAttributes(player) {
  if (!player?.id) return '';
  return `role="button" tabindex="0" data-player-id="${escapeHtml(player.id)}" aria-label="Ver ficha de ${escapeHtml(player.name || 'jugador')}" onclick="openProfileFromElement(this)" onkeydown="handleClickableKeydown(event)"`;
}

function closeRevokedSessionUi() {
  if (typeof cancelGoalAssist === 'function') cancelGoalAssist(true);
  if (typeof cancelClubConfirmation === 'function') cancelClubConfirmation();
  if (typeof cancelAdminPasswordDialog === 'function') cancelAdminPasswordDialog();
  if (typeof cancelPlayerRemoval === 'function') cancelPlayerRemoval();
  if (typeof toggleClubCrestDesigner === 'function' && typeof clubCrestDesignerOpen !== 'undefined' && clubCrestDesignerOpen) {
    toggleClubCrestDesigner(false);
  }
  document.querySelectorAll('.modal-overlay.open').forEach(modal => closeModal(modal.id));
}

function revokeCurrentUserAccess() {
  closeRevokedSessionUi();
  if (typeof resetTeamDraftState === 'function') resetTeamDraftState();
  state.players = [];
  matches = [];
  if (typeof golesMatchId !== 'undefined') golesMatchId = null;
  state.currentUser = null;
  SESSION.del();
  stopSync();
  const adminTab = document.getElementById('admin-tab');
  if (adminTab) adminTab.style.display = 'none';
  const masterButton = document.getElementById('platform-admin-launch');
  if (masterButton) masterButton.style.display = 'none';
  showScreen('screen-login');
  showLoginForm();
  showToast('⚠️ Tu sesión dejó de estar vinculada a este club. Iniciá sesión nuevamente.', 4800);
}

// Mantiene permisos y sesión alineados con el servidor. `accessSnapshot.ok`
// distingue un null confirmado (cuenta eliminada o contraseña reemplazada) de
// una falla transitoria, que nunca debe expulsar al usuario. Si esa consulta
// puntual falla pero el plantel sí llegó, éste sigue siendo evidencia válida.
function reconcileCurrentUserAccess(freshPlayers, accessSnapshot = null) {
  if (!state.currentUser || state.currentUser.supportMode) return true;

  let ownPlayer = null;
  let platformAdmin = !!state.currentUser.isPlatformAdmin;
  if (accessSnapshot?.ok === true) {
    if (!accessSnapshot.player) {
      revokeCurrentUserAccess();
      return false;
    }
    ownPlayer = mapPlayers([accessSnapshot.player])[0] || null;
    platformAdmin = !!accessSnapshot.player.is_platform_admin;
  } else if (Array.isArray(freshPlayers)) {
    ownPlayer = freshPlayers.find(player => player.id === state.currentUser.id) || null;
    if (!ownPlayer) {
      revokeCurrentUserAccess();
      return false;
    }
  } else {
    return true;
  }

  if (!ownPlayer) {
    revokeCurrentUserAccess();
    return false;
  }

  const wasAdmin = !!state.currentUser.isAdmin;
  state.currentUser = {
    ...state.currentUser,
    name: ownPlayer.name,
    username: ownPlayer.username,
    isAdmin: !!ownPlayer.isAdmin,
    isPlatformAdmin: platformAdmin
  };
  if (wasAdmin && !state.currentUser.isAdmin && state.currentClub) {
    // El código sólo pertenece al contexto administrativo. No debe quedar en
    // memoria después de una degradación aunque el resto de la marca no cambie.
    state.currentClub.inviteCode = null;
  }
  SESSION.set({
    ...state.currentUser,
    clubName: state.currentClub.name,
    clubCrest: state.currentClub.crest || null,
    clubCrestDesign: state.currentClub.crestDesign || null,
    clubInviteCode: state.currentUser.isAdmin ? state.currentClub.inviteCode || null : null,
    clubMatchWeekday: state.currentClub.matchWeekday,
    clubMatchTime: state.currentClub.matchTime,
    clubMatchVenue: state.currentClub.matchVenue,
    clubMatchAddress: state.currentClub.matchAddress
  });
  const adminTab = document.getElementById('admin-tab');
  if (adminTab) adminTab.style.display = state.currentUser.isAdmin ? '' : 'none';
  const masterButton = document.getElementById('platform-admin-launch');
  if (masterButton) masterButton.style.display = state.currentUser.isPlatformAdmin ? 'inline-flex' : 'none';
  const username = document.getElementById('topbar-username');
  if (username) username.textContent = state.currentUser.name;
  const avatarWrap = document.getElementById('topbar-avatar-wrap');
  const avatarUrl = safePhotoUrl(ownPlayer.photo);
  if (avatarWrap) {
    avatarWrap.innerHTML = avatarUrl
      ? `<img class="topbar-avatar" src="${escapeHtml(avatarUrl)}" alt="">`
      : '<div class="topbar-avatar-placeholder">👤</div>';
  }
  if (!state.currentUser.isAdmin && getActiveTabName() === 'admin') switchTab('inicio');
  if (wasAdmin !== state.currentUser.isAdmin) {
    showToast(state.currentUser.isAdmin ? '👑 Ahora sos administrador del club' : 'ℹ️ Tu acceso de administrador fue actualizado', 3600);
  }
  return true;
}

function switchTab(name) {
  if (!TAB_ORDER.includes(name)) return;
  if (name === 'admin' && !state.currentUser?.isAdmin) {
    showToast('⚠️ Esta sección es sólo para administradores.');
    name = 'inicio';
  }
  document.querySelectorAll('.nav-tab').forEach((t,i) => {
    const selected = (tabNameFromElement(t) || TAB_ORDER[i]) === name;
    t.classList.toggle('active', selected);
    t.setAttribute?.('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('.tab-content').forEach(t => {
    const selected = t.id === `tab-${name}`;
    t.classList.toggle('active', selected);
    t.hidden = !selected;
  });
  const panel = document.getElementById('tab-'+name);
  if (!panel) return;
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
