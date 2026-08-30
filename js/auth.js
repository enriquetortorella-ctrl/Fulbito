// AUTH
// ============================================================
let regPhotoData = null;
let regPosPrimary = null;
let regPosSecondary = null;

function showLoginForm() {
  document.getElementById('login-form-box').classList.remove('hidden');
  document.getElementById('register-form-box').classList.add('hidden');
  document.getElementById('forgot-form-box').classList.add('hidden');
  updateLoginClubContext();
}
function showRegisterForm() {
  document.getElementById('login-form-box').classList.add('hidden');
  document.getElementById('register-form-box').classList.remove('hidden');
  document.getElementById('forgot-form-box').classList.add('hidden');
}
function showForgotForm() {
  document.getElementById('login-form-box').classList.add('hidden');
  document.getElementById('register-form-box').classList.add('hidden');
  document.getElementById('forgot-form-box').classList.remove('hidden');
}

async function doLogin() {
  if (!state.currentClub) { showClubChooser(); return; }
  const userInput = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  if (!userInput || !pass) { errEl.textContent = 'Ingresá usuario y contraseña.'; errEl.style.display = 'block'; return; }
  try {
    const data = await callRpc('fulbito_login_player', {
      p_club_id: state.currentClub.id,
      p_username: userInput,
      p_password: pass
    });
    await openAuthorizedPlayer(data);
  } catch (_) {
    // El servidor devuelve el mismo mensaje para usuario y contraseña para no revelar cuentas.
    errEl.innerHTML = 'Usuario o contraseña incorrectos. <a href="#" onclick="showForgotForm();return false" style="color:var(--gold)">¿La olvidaste?</a>';
    errEl.style.display = 'block';
  }
}

async function doRegister() {
  if (!state.currentClub) { showClubChooser(); return; }
  const name = document.getElementById('reg-name').value.trim();
  const user = document.getElementById('reg-user').value.trim().toLowerCase();
  const pass = document.getElementById('reg-pass').value;
  const errEl = document.getElementById('reg-error');
  errEl.style.display = 'none';

  if (!name || !user || !pass) { errEl.textContent='Completá nombre, usuario y contraseña'; errEl.style.display='block'; return; }
  if (!regPosPrimary) { errEl.textContent='Elegí tu posición principal'; errEl.style.display='block'; return; }
  const inviteCode = state.currentClub.inviteCode || (state.currentClub.id === LEGACY_CLUB_ID ? '__LEGACY_PUBLIC__' : '');
  if (!inviteCode) { errEl.textContent = 'Volvé a ingresar al club con el código de invitación.'; errEl.style.display = 'block'; return; }
  try {
    const data = await callRpc('fulbito_register_player', {
      p_invite_code: inviteCode,
      p_name: name,
      p_username: user,
      p_password: pass,
      p_pos_primary: regPosPrimary,
      p_pos_secondary: regPosSecondary || regPosPrimary,
      p_photo: regPhotoData || null
    });
    await openAuthorizedPlayer(data);
  } catch (error) {
    errEl.textContent = error.message || 'No se pudo crear la cuenta.';
    errEl.style.display = 'block';
  }
}

async function openAuthorizedPlayer(data) {
  const player = mapPlayers([data])[0];
  state.supportMode = false;
  state.supportHome = null;
  state.currentUser = { id: player.id, username: player.username, name: player.name, isAdmin: !!player.isAdmin, isPlatformAdmin: !!data.is_platform_admin, clubId: state.currentClub.id };
  SESSION.set({ ...state.currentUser, clubName: state.currentClub.name });
  state.players = await loadPlayers(state.currentClub.id);
  matches = await loadMatches(state.currentClub.id);
  showApp();
}

async function doLogout() {
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
}

// ============================================================
