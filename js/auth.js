// AUTH
// ============================================================
let regPhotoData = null;
let regPosPrimary = null;
let regPosSecondary = null;
let regRatingMode = 'field';
let authAttemptGeneration = 0;

function invalidateAuthAttempt() {
  authAttemptGeneration++;
}

function resetRegisterForm() {
  regPhotoData = null;
  regPosPrimary = null;
  regPosSecondary = null;
  regRatingMode = 'field';
  ['reg-name','reg-user','reg-pass'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  const photoInput = document.getElementById('reg-photo-input');
  if (photoInput) photoInput.value = '';
  const preview = document.getElementById('reg-photo-preview');
  if (preview) preview.textContent = '📷';
  document.querySelectorAll('#reg-pos-primary .pos-btn,#reg-pos-secondary .pos-btn').forEach(button => button.classList.remove('selected'));
  renderRegRatingMode();
}

function showLoginForm() {
  invalidateAuthAttempt();
  document.getElementById('login-form-box').classList.remove('hidden');
  document.getElementById('register-form-box').classList.add('hidden');
  document.getElementById('forgot-form-box').classList.add('hidden');
  updateLoginClubContext();
}
async function showRegisterForm() {
  const attemptGeneration = ++authAttemptGeneration;
  const clubId = state.currentClub?.id;
  if (!clubId) { showClubChooser(); return; }
  if (!state.currentClub?.inviteCode) {
    const codeInput = document.getElementById('login-invite-code');
    const code = safePlainText(codeInput?.value, 16).toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const errEl = document.getElementById('login-error');
    if (!code) {
      errEl.textContent = 'Ingresá el código que te compartió el administrador para poder registrarte.';
      errEl.style.display = 'block';
      codeInput?.focus();
      return;
    }
    try {
      const data = await callRpc('fulbito_lookup_club', { p_invite_code: code });
      if (attemptGeneration !== authAttemptGeneration || state.currentClub?.id !== clubId) return;
      if (!data || data.id !== clubId) throw new Error('Código inválido para este club');
      state.currentClub = { ...state.currentClub, ...mapClubBrand(data, state.currentClub), inviteCode: code };
      const known = state.clubs.find(club => club.id === state.currentClub.id);
      if (known) Object.assign(known, state.currentClub);
      KNOWN_CLUBS.remember(state.currentClub);
      updateLoginClubContext();
      errEl.style.display = 'none';
    } catch (_) {
      if (attemptGeneration !== authAttemptGeneration || state.currentClub?.id !== clubId) return;
      errEl.textContent = 'El código no es válido para el club seleccionado. Pedíselo al administrador.';
      errEl.style.display = 'block';
      codeInput?.focus();
      return;
    }
  }
  document.getElementById('login-form-box').classList.add('hidden');
  document.getElementById('register-form-box').classList.remove('hidden');
  document.getElementById('forgot-form-box').classList.add('hidden');
}
function showForgotForm() {
  invalidateAuthAttempt();
  document.getElementById('login-form-box').classList.add('hidden');
  document.getElementById('register-form-box').classList.add('hidden');
  document.getElementById('forgot-form-box').classList.remove('hidden');
}

async function doLogin() {
  if (!state.currentClub) { showClubChooser(); return; }
  const clubId = state.currentClub.id;
  const attemptGeneration = ++authAttemptGeneration;
  const userInput = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  if (!userInput || !pass) { errEl.textContent = 'Ingresá usuario y contraseña.'; errEl.style.display = 'block'; return; }
  try {
    const data = await callRpc('fulbito_login_player', {
      p_club_id: clubId,
      p_username: userInput,
      p_password: pass
    });
    if (attemptGeneration !== authAttemptGeneration || state.currentClub?.id !== clubId) return;
    await openAuthorizedPlayer(data, { clubId, attemptGeneration });
  } catch (_) {
    if (attemptGeneration !== authAttemptGeneration || state.currentClub?.id !== clubId) return;
    // El servidor devuelve el mismo mensaje para usuario y contraseña para no revelar cuentas.
    errEl.innerHTML = 'Usuario o contraseña incorrectos. <a href="#" onclick="showForgotForm();return false" style="color:var(--gold)">¿La olvidaste?</a>';
    errEl.style.display = 'block';
  }
}

async function doRegister() {
  if (!state.currentClub) { showClubChooser(); return; }
  const clubId = state.currentClub.id;
  const attemptGeneration = ++authAttemptGeneration;
  const name = document.getElementById('reg-name').value.trim();
  const user = document.getElementById('reg-user').value.trim().toLowerCase();
  const pass = document.getElementById('reg-pass').value;
  const errEl = document.getElementById('reg-error');
  errEl.style.display = 'none';

  if (!name || !user || !pass) { errEl.textContent='Completá nombre, usuario y contraseña'; errEl.style.display='block'; return; }
  if (!regPosPrimary) { errEl.textContent='Elegí tu posición principal'; errEl.style.display='block'; return; }
  const inviteCode = safePlainText(state.currentClub.inviteCode, 24);
  if (!inviteCode) { errEl.textContent = 'Volvé a ingresar al club con el código de invitación.'; errEl.style.display = 'block'; return; }
  try {
    const data = await callRpc('fulbito_register_player', {
      p_invite_code: inviteCode,
      p_name: name,
      p_username: user,
      p_password: pass,
      p_pos_primary: regPosPrimary,
      p_pos_secondary: regPosSecondary || regPosPrimary,
      p_rating_mode: regRatingMode,
      p_photo: regPhotoData || null
    });
    if (attemptGeneration !== authAttemptGeneration || state.currentClub?.id !== clubId) return;
    await openAuthorizedPlayer(data, { clubId, attemptGeneration });
  } catch (error) {
    if (attemptGeneration !== authAttemptGeneration || state.currentClub?.id !== clubId) return;
    errEl.textContent = error.message || 'No se pudo crear la cuenta.';
    errEl.style.display = 'block';
  }
}

async function openAuthorizedPlayer(data, { clubId = state.currentClub?.id, attemptGeneration = authAttemptGeneration } = {}) {
  if (!clubId || attemptGeneration !== authAttemptGeneration || state.currentClub?.id !== clubId) return false;
  resetTeamDraftState();
  const player = mapPlayers([data])[0];
  state.supportMode = false;
  state.supportHome = null;
  state.currentUser = { id: player.id, username: player.username, name: player.name, isAdmin: !!player.isAdmin, isPlatformAdmin: !!data.is_platform_admin, clubId };
  SESSION.set({ ...state.currentUser, clubName: state.currentClub.name, clubCrest: state.currentClub.crest || null, clubCrestDesign: state.currentClub.crestDesign || null, clubInviteCode: state.currentUser.isAdmin ? state.currentClub.inviteCode || null : null });
  const [authorizedPlayers, savedMatches] = await Promise.all([
    loadPlayers(clubId),
    loadMatches(clubId)
  ]);
  if (attemptGeneration !== authAttemptGeneration || state.currentClub?.id !== clubId || state.currentUser?.id !== player.id) return false;
  state.players = authorizedPlayers === null ? [] : authorizedPlayers;
  // Al iniciar sesión no reutilizamos partidos de otro club. Si la lectura
  // falla, la pantalla arranca vacía y el auto-sync puede recuperarla.
  matches = savedMatches === null ? [] : savedMatches;
  showApp();
  return true;
}

async function doLogout() {
  invalidateAuthAttempt();
  resetTeamDraftState();
  resetRegisterForm();
  state.currentUser = null;
  SESSION.del();
  stopSync();
  await sb.auth.signOut();
  anonymousSessionReady = null;
  showScreen('screen-login');
  showLoginForm();
}

function compressPhoto(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const MAX = 200;
    let w = img.width, h = img.height;
    if (w > h) { if (w > MAX) { h = h*MAX/w; w = MAX; } }
    else { if (h > MAX) { w = w*MAX/h; h = MAX; } }
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', 0.82));
  };
  img.src = dataUrl;
}

function handleRegPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    compressPhoto(e.target.result, compressed => {
      regPhotoData = compressed;
      const prev = document.getElementById('reg-photo-preview');
      prev.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    });
  };
  reader.readAsDataURL(file);
}

function selectPos(type, el) {
  const grid = el.closest('.pos-grid');
  grid.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  if (type === 'primary') regPosPrimary = el.dataset.pos;
  else regPosSecondary = el.dataset.pos;
  if (type === 'primary') renderRegRatingMode();
}

function renderRegRatingMode() {
  const group = document.getElementById('reg-rating-mode-group');
  if (!group) return;
  if (regPosPrimary !== 'POR') {
    regRatingMode = 'field';
    group.classList.add('hidden');
    group.innerHTML = '';
    return;
  }
  group.classList.remove('hidden');
  group.innerHTML = `
    <label>¿Cómo querés que te califiquen?</label>
    <div class="pos-grid" id="reg-rating-mode">
      <button type="button" class="pos-btn${regRatingMode==='goalkeeper'?' selected':''}" onclick="selectRegRatingMode('goalkeeper')">🧤 Estadísticas de arquero</button>
      <button type="button" class="pos-btn${regRatingMode==='field'?' selected':''}" onclick="selectRegRatingMode('field')">⚽ Estadísticas de campo</button>
    </div>
    <div class="text-muted" style="font-size:12px;margin-top:7px">La elección define las seis estadísticas que verán tus compañeros al calificarte.</div>`;
}

function selectRegRatingMode(mode) {
  regRatingMode = mode === 'goalkeeper' ? 'goalkeeper' : 'field';
  renderRegRatingMode();
}

// ============================================================
