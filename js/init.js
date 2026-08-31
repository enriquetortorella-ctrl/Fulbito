// INIT
// ============================================================
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function safePlainText(value, maxLength = 80) {
  return String(value ?? '').replace(/[<>&"'`\u0000-\u001F\u007F]/g, '').slice(0, maxLength);
}

function safePhotoUrl(value) {
  const src = String(value || '');
  return /^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/i.test(src) ? src : '';
}

function showClubError(message, target = 'club-error') {
  const el = document.getElementById(target);
  if (!el) return;
  el.textContent = message || '';
  el.style.display = message ? 'block' : 'none';
}

function renderClubChooser() {
  const list = document.getElementById('club-list');
  if (!list) return;
  if (!state.clubs.length) {
    list.innerHTML = '<div class="club-empty">Todavía no hay clubes disponibles. Intentá actualizar en unos segundos.</div>';
    return;
  }
  const knownIds = new Set(KNOWN_CLUBS.get().map(club => club.id));
  list.innerHTML = state.clubs.map(club => {
    const crest = safeClubCrestUrl(club.crest);
    const isKnown = knownIds.has(club.id);
    return `<button class="club-card" type="button" data-club-id="${escapeHtml(club.id)}">
      <span class="club-card-crest ${crest ? 'has-custom-crest' : ''}">${crest ? `<img src="${escapeHtml(crest)}" alt="">` : escapeHtml(clubInitials(club.name))}</span>
      <span class="club-card-copy"><span class="club-card-name">${escapeHtml(club.name)}</span><span class="club-card-meta">${isKnown ? 'Ingresaste antes' : 'Acceso con usuario'}</span></span>
      <span class="club-card-arrow">›</span>
    </button>`;
  }).join('');
  list.querySelectorAll('[data-club-id]').forEach(button => {
    button.addEventListener('click', () => selectClub(button.dataset.clubId));
  });
}

async function refreshClubChooser() {
  const list = document.getElementById('club-list');
  if (list) list.innerHTML = '<div class="club-empty">⏳ Cargando clubes...</div>';
  state.clubs = await loadClubs();
  renderClubChooser();
}

function showClubLanding() {
  document.getElementById('club-chooser-box').classList.remove('hidden');
  document.getElementById('club-create-box').classList.add('hidden');
  showClubError('');
  showClubError('', 'club-create-error');
  showScreen('screen-club');
  renderClubChooser();
}

async function showClubChooser() {
  SESSION.del();
  state.currentUser = null;
  state.currentClub = null;
  state.players = [];
  state.supportMode = false;
  state.supportHome = null;
  matches = [];
  stopSync();
  showClubLanding();
  await refreshClubChooser();
}

function showCreateClubForm() {
  document.getElementById('club-chooser-box').classList.add('hidden');
  document.getElementById('club-create-box').classList.remove('hidden');
  document.getElementById('club-create-form').classList.remove('hidden');
  document.getElementById('club-create-success').classList.add('hidden');
  document.getElementById('club-create-name').value = '';
  showClubError('', 'club-create-error');
}

async function createClub() {
  const name = document.getElementById('club-create-name').value.trim();
  if (name.length < 3) {
    showClubError('Elegí un nombre de al menos 3 caracteres.', 'club-create-error');
    return;
  }
  let data;
  try {
    data = await callRpc('fulbito_create_club', { p_name: name });
  } catch (error) {
    console.error('createClub:', error);
    showClubError(`No se pudo crear el club: ${error.message}`, 'club-create-error');
    return;
  }
  const club = { id: data.id, name: data.name, crest: safeClubCrestUrl(data.crest), inviteCode: data.invite_code };
  state.clubs.push(club);
  KNOWN_CLUBS.remember(club);
  window.__newClubInviteCode = club.inviteCode;
  document.getElementById('club-create-form').classList.add('hidden');
  const success = document.getElementById('club-create-success');
  success.innerHTML = `
    <p class="club-create-note">¡Listo! Compartí este código con tu grupo para que entren al espacio correcto.</p>
    <div class="club-code-reveal">${escapeHtml(club.inviteCode)}</div>
    <button class="btn-login" onclick="selectClub('${club.id}')">CONTINUAR Y CREAR MI CUENTA</button>
    <div class="login-divider"></div>
    <button class="btn-register" onclick="showClubChooser()">Volver a mis clubes</button>`;
  success.classList.remove('hidden');
}

async function joinClubByCode() {
  const input = document.getElementById('club-invite-input');
  const code = input.value.trim().toUpperCase();
  if (!code) {
    showClubError('Ingresá el código que te compartieron.');
    return;
  }
  let data;
  try {
    data = await callRpc('fulbito_lookup_club', { p_invite_code: code });
  } catch (error) {
    console.error('joinClubByCode:', error);
    showClubError('No pudimos validar ese código. Intentá nuevamente.');
    return;
  }
  const club = data ? { id: data.id, name: data.name, crest: safeClubCrestUrl(data.crest), inviteCode: code } : null;
  if (!club) {
    showClubError('No encontramos un club con ese código. Revisalo e intentá de nuevo.');
    return;
  }
  input.value = '';
  showClubError('');
  const knownClub = state.clubs.find(item => item.id === club.id);
  if (knownClub) Object.assign(knownClub, club);
  else state.clubs.push(club);
  KNOWN_CLUBS.remember(club);
  await selectClub(club.id);
}

function updateLoginClubContext() {
  const context = document.getElementById('login-club-context');
  if (!context || !state.currentClub) return;
  const codeInput = document.getElementById('login-invite-code');
  const code = window.__newClubInviteCode && state.currentClub.inviteCode === window.__newClubInviteCode
    ? ` · Código ${state.currentClub.inviteCode}` : '';
  context.textContent = `🏟️ ${state.currentClub.name}${code}`;
  context.classList.remove('hidden');
  if (codeInput) codeInput.value = state.currentClub.inviteCode || '';
}

async function selectClub(clubId, { restoreSession = false } = {}) {
  const club = state.clubs.find(item => item.id === clubId);
  if (!club) {
    showClubError('No pudimos abrir ese club. Actualizá e intentá de nuevo.');
    return;
  }
  state.currentClub = club;
  KNOWN_CLUBS.remember(club);
  state.supportMode = false;
  state.supportHome = null;
  state.players = [];
  matches = [];
  updateLoginClubContext();

  const saved = SESSION.get();
  const savedClubId = saved?.clubId || (saved ? LEGACY_CLUB_ID : null);
  if (restoreSession && saved && savedClubId === club.id) {
    let player = null;
    try { player = await callRpc('fulbito_get_my_player', { p_club_id: club.id }); } catch (_) { player = null; }
    if (player) {
      const mapped = mapPlayers([player])[0];
      state.currentUser = { id: mapped.id, username: mapped.username, name: mapped.name, isAdmin: !!mapped.isAdmin, isPlatformAdmin: !!player.is_platform_admin, clubId: club.id };
      state.players = await loadPlayers(club.id);
      SESSION.set({ ...state.currentUser, clubName: club.name, clubCrest: club.crest || null, clubInviteCode: mapped.isAdmin ? club.inviteCode || null : null });
      showApp();
      return;
    }
    SESSION.del();
  }
  showScreen('screen-login');
  showLoginForm();
  document.getElementById('login-user').focus();
}

async function init() {
  document.getElementById('login-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  showScreen('screen-club');
  try { await getSB(); } catch (error) { showClubError(`No se pudo iniciar una sesión segura: ${error.message}`); }
  await refreshClubChooser();
  const sess = SESSION.get();
  const clubId = sess?.clubId || (sess ? LEGACY_CLUB_ID : null);
  if (sess && sess.clubName && !state.clubs.some(club => club.id === clubId)) {
    state.clubs.push({ id: clubId, name: safePlainText(sess.clubName, 50) || 'Mi club', crest: safeClubCrestUrl(sess.clubCrest), inviteCode: safePlainText(sess.clubInviteCode, 24) || null });
  }
  if (sess && state.clubs.some(club => club.id === clubId)) {
    await selectClub(clubId, { restoreSession: true });
    return;
  }
  if (sess) SESSION.del();
  showClubLanding();
}

async function refreshPlayers() {
  showToast('⏳ Actualizando...');
  state.players = await loadPlayers();
  matches = await loadMatches();
  renderHub();
  renderPlayers();
  renderAttendance();
  showToast(`✅ ${state.players.length} jugadores cargados`);
}

// ============================================================
