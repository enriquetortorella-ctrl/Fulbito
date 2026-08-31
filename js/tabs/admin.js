// ADMIN
// ============================================================
let clubBrandDraftCrest;
let clubBrandDraftName = '';
let clubBrandDraftClubId = null;
let clubInviteEditorOpen = false;

function clubBrandPreviewHTML(crest, name) {
  const imageUrl = safeClubCrestUrl(crest);
  return imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="Escudo de ${escapeHtml(name)}">`
    : `<span>${escapeHtml(clubInitials(name))}</span>`;
}

function renderAdmin() {
  const clubInfo = document.getElementById('club-admin-info');
  if (clubInfo && state.currentClub) {
    if (clubBrandDraftClubId !== state.currentClub.id) {
      clubBrandDraftClubId = state.currentClub.id;
      clubBrandDraftCrest = undefined;
      clubBrandDraftName = '';
    }
    const draftName = clubBrandDraftName || state.currentClub.name;
    const draftCrest = clubBrandDraftCrest === undefined ? state.currentClub.crest : clubBrandDraftCrest;
    const isSupport = !!state.currentUser?.supportMode;
    const inviteCode = safePlainText(state.currentClub.inviteCode, 24);
    const invite = isSupport ? `
      <div class="club-brand-invite"><div><b>🛡️ Código de invitación</b><span>Vista de administrador maestro · solo lectura.</span></div><div class="club-invite-action"><code>${escapeHtml(inviteCode || 'Sin código')}</code></div></div>` : `
      <div class="club-brand-invite"><div><b>Código de invitación</b><span>Compartilo para que entren al grupo.</span></div><div class="club-invite-action"><code>${escapeHtml(inviteCode || 'Cargando…')}</code><button class="btn btn-gold btn-sm" onclick="copyClubInviteCode()" ${inviteCode ? '' : 'disabled'}>📋 Copiar</button><button class="btn btn-ghost btn-sm" onclick="toggleClubInviteEditor()" ${inviteCode ? '' : 'disabled'}>✏ Cambiar</button></div></div>
      ${clubInviteEditorOpen ? `<div class="club-invite-editor"><div><label for="club-invite-code-input">Nuevo código</label><input id="club-invite-code-input" maxlength="16" value="${escapeHtml(inviteCode)}" placeholder="EJ: MARMOL-26" autocomplete="off" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,16)"><small>De 4 a 16 caracteres: letras, números o guion. El anterior dejará de funcionar.</small></div><div class="club-invite-editor-actions"><button class="btn btn-primary btn-sm" onclick="saveClubInviteCode()">Guardar código</button><button class="btn btn-ghost btn-sm" onclick="toggleClubInviteEditor(false)">Cancelar</button></div></div>` : ''}`;
    clubInfo.innerHTML = `
      <div class="club-brand-editor">
        <div class="club-brand-preview ${safeClubCrestUrl(draftCrest) ? 'has-custom-crest' : ''}" id="club-brand-preview">${clubBrandPreviewHTML(draftCrest, draftName)}</div>
        <div class="club-brand-fields">
          <label for="club-brand-name">Nombre del club</label>
          <input id="club-brand-name" maxlength="50" value="${escapeHtml(draftName)}" placeholder="Ej.: Los del Sábado" oninput="trackClubBrandName(this.value)">
          <label class="club-brand-upload" for="club-brand-crest-input">🖼️ Cambiar escudo <small>PNG, JPG o WEBP · se optimiza antes de guardar</small></label>
          <input id="club-brand-crest-input" type="file" accept="image/png,image/jpeg,image/webp" onchange="previewClubCrest(this)">
          <div class="club-brand-actions"><button class="btn btn-primary btn-sm" onclick="saveClubIdentity()">💾 Guardar identidad</button><button class="btn btn-ghost btn-sm" onclick="clearClubCrest()">↺ Usar iniciales</button></div>
        </div>
      </div>
      ${invite}`;
  }
  const list = document.getElementById('admin-players-list');
  const myId = state.currentUser?.id;
  const canManageAccounts = state.currentUser?.isAdmin && !state.currentUser?.supportMode;
  list.innerHTML = state.players.map(p => {
    const isMe = p.id === myId;
    const actions = !canManageAccounts ? '' : isMe
      ? `<span class="admin-player-self">Tu cuenta</span>`
      : `<div class="admin-player-actions">
          <button class="btn-icon" title="${p.isAdmin?'Quitar admin':'Hacer admin'}" onclick="toggleAdmin('${p.id}')">${p.isAdmin?'👑':'⬜'}</button>
          <button class="btn-icon" title="Cambiar contraseña" onclick="adminChangePassword('${p.id}')">🔑</button>
          <button class="btn-icon" title="Eliminar usuario" onclick="removePlayer('${p.id}', this)">🗑️</button>
        </div>`;
    return `
    <div class="admin-player-row">
      <div style="font-size:20px">${posEmoji(getEffectivePosition(p))}</div>
      <div class="admin-player-name">${p.name} <span style="color:var(--muted);font-size:12px">@${p.username}</span>${p.isAdmin?' 👑':''}${p._resetRequested?' <span style="color:var(--red);font-size:11px">⚠️ pidió reset</span>':''}</div>
      ${actions}
    </div>
  `;
  }).join('');
}

function updateClubBrandPreview(crest, name) {
  const preview = document.getElementById('club-brand-preview');
  if (!preview) return;
  preview.classList.toggle('has-custom-crest', !!safeClubCrestUrl(crest));
  preview.innerHTML = clubBrandPreviewHTML(crest, name);
}

function trackClubBrandName(name) {
  clubBrandDraftName = safePlainText(name, 50);
  const crest = clubBrandDraftCrest === undefined ? state.currentClub?.crest : clubBrandDraftCrest;
  updateClubBrandPreview(crest, clubBrandDraftName || state.currentClub?.name || 'FC');
}

function removeNeutralBackgroundConnectedToEdge(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  // El tablero blanco/gris de imágenes descargadas suele ser gris neutro y
  // está conectado al borde. Solo quitamos esa región exterior: los blancos
  // que forman parte del escudo quedan aislados por su propio contorno.
  const isNeutralLightPixel = (index) => {
    const offset = index * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const alpha = pixels[offset + 3];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    return alpha > 0 && maximum - minimum <= 22 && (red + green + blue) / 3 >= 158;
  };
  const enqueue = (index) => {
    if (!visited[index] && isNeutralLightPixel(index)) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  };

  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    pixels[index * 4 + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }
  context.putImageData(imageData, 0, 0);
}

async function optimizeClubCrest(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) {
    throw new Error('Elegí una imagen PNG, JPG o WEBP.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('El archivo supera los 5 MB. Elegí una imagen más liviana.');
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error('No pudimos leer esa imagen.'));
      candidate.src = sourceUrl;
    });
    const side = Math.min(360, Math.max(96, Math.min(image.naturalWidth, image.naturalHeight)));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: true });
    let currentSide = side;
    let encoded = '';
    do {
      canvas.width = currentSide;
      canvas.height = currentSide;
      // Nunca recortamos: el escudo entra entero en una zona segura del 84%.
      // Así funcionan igual logos cuadrados, redondos, altos o apaisados.
      const safeSide = currentSide * .84;
      const scale = Math.min(safeSide / image.naturalWidth, safeSide / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      context.clearRect(0, 0, currentSide, currentSide);
      context.drawImage(image, (currentSide - drawWidth) / 2, (currentSide - drawHeight) / 2, drawWidth, drawHeight);
      removeNeutralBackgroundConnectedToEdge(context, currentSide, currentSide);
      encoded = canvas.toDataURL('image/webp', .84);
      currentSide = Math.floor(currentSide * .82);
    } while (encoded.length > 240000 && currentSide >= 96);
    if (encoded.length > 250000) throw new Error('La imagen sigue siendo demasiado pesada. Probá con otra más simple.');
    return encoded;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function previewClubCrest(input) {
  const file = input?.files?.[0];
  if (!file) return;
  try {
    input.disabled = true;
    clubBrandDraftCrest = await optimizeClubCrest(file);
    updateClubBrandPreview(clubBrandDraftCrest, clubBrandDraftName || document.getElementById('club-brand-name')?.value || state.currentClub.name);
    showToast('✅ Escudo listo para guardar');
  } catch (error) {
    input.value = '';
    showToast(`❌ ${error.message}`);
  } finally {
    input.disabled = false;
  }
}

function clearClubCrest() {
  clubBrandDraftCrest = null;
  const fileInput = document.getElementById('club-brand-crest-input');
  if (fileInput) fileInput.value = '';
  updateClubBrandPreview(null, clubBrandDraftName || document.getElementById('club-brand-name')?.value || state.currentClub?.name || 'FC');
}

async function saveClubIdentity() {
  if (!state.currentUser?.isAdmin || !state.currentClub) return;
  const nameInput = document.getElementById('club-brand-name');
  const nextName = safePlainText(nameInput?.value, 50).trim();
  if (nextName.length < 3) {
    showToast('⚠️ El nombre debe tener al menos 3 caracteres.');
    return;
  }
  const button = document.querySelector('.club-brand-actions .btn-primary');
  if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
  try {
    const crest = clubBrandDraftCrest === undefined ? state.currentClub.crest : clubBrandDraftCrest;
    const freshClub = await saveClubBrand(nextName, crest);
    state.currentClub = { ...state.currentClub, ...freshClub };
    const known = state.clubs.find(club => club.id === freshClub.id);
    if (known) Object.assign(known, freshClub);
    KNOWN_CLUBS.remember(state.currentClub);
    SESSION.set({ ...state.currentUser, clubName: freshClub.name, clubCrest: freshClub.crest || null, clubInviteCode: state.currentUser.isAdmin ? freshClub.inviteCode || null : null });
    clubBrandDraftCrest = undefined;
    clubBrandDraftName = '';
    clubBrandDraftClubId = state.currentClub.id;
    renderClubIdentity();
    renderHub();
    renderAdmin();
    showToast('✅ Identidad del club actualizada para todo el grupo');
  } catch (error) {
    showToast(`❌ ${error.message}`);
    if (button) { button.disabled = false; button.textContent = '💾 Guardar identidad'; }
  }
}

async function copyClubInviteCode() {
  let code = state.currentClub?.inviteCode;
  if (!code) {
    const freshClub = await loadClubBrand();
    if (!freshClub?.inviteCode) { showToast('⚠️ No pudimos recuperar el código. Actualizá la pantalla.'); return; }
    state.currentClub = { ...state.currentClub, ...freshClub };
    code = freshClub.inviteCode;
    renderAdmin();
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API no disponible');
    await navigator.clipboard.writeText(code);
    showToast(`✅ Código ${code} copiado`);
  } catch {
    const fallback = document.createElement('textarea');
    fallback.value = code;
    fallback.setAttribute('readonly', '');
    fallback.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(fallback);
    fallback.select();
    const copied = document.execCommand('copy');
    fallback.remove();
    showToast(copied ? `✅ Código ${code} copiado` : `Código del club: ${code}`, 4000);
  }
}

function toggleClubInviteEditor(force) {
  if (!state.currentUser?.isAdmin) return;
  clubInviteEditorOpen = typeof force === 'boolean' ? force : !clubInviteEditorOpen;
  renderAdmin();
  if (clubInviteEditorOpen) document.getElementById('club-invite-code-input')?.focus();
}

async function saveClubInviteCode() {
  if (!state.currentUser?.isAdmin || !state.currentClub) return;
  const input = document.getElementById('club-invite-code-input');
  const nextCode = safePlainText(input?.value, 16).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!/^[A-Z0-9][A-Z0-9-]{3,15}$/.test(nextCode)) {
    showToast('⚠️ Usá entre 4 y 16 letras, números o guiones.');
    return;
  }
  const button = document.querySelector('.club-invite-editor-actions .btn-primary');
  if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
  try {
    const freshClub = await updateClubInviteCode(nextCode);
    state.currentClub = { ...state.currentClub, ...freshClub };
    const known = state.clubs.find(club => club.id === freshClub.id);
    if (known) Object.assign(known, freshClub);
    SESSION.set({ ...state.currentUser, clubName: state.currentClub.name, clubCrest: state.currentClub.crest || null, clubInviteCode: nextCode });
    clubInviteEditorOpen = false;
    renderAdmin();
    showToast('✅ Código actualizado. El anterior ya no permite ingresar.');
  } catch (error) {
    showToast(`❌ ${error.message || 'No se pudo cambiar el código.'}`);
    if (button) { button.disabled = false; button.textContent = 'Guardar código'; }
  }
}

async function removePlayer(id, button) {
  const p = state.players.find(x=>x.id===id);
  if (!p) return;
  if (p.id === state.currentUser?.id) { showToast('⚠️ No podés eliminar tu propia cuenta desde acá.'); return; }
  const admins = state.players.filter(player => player.isAdmin);
  if (p.isAdmin && admins.length <= 1) {
    showToast('⚠️ No se puede eliminar al último administrador. Primero asigná otro admin.');
    return;
  }
  if (!confirm(`¿Eliminar a ${p.name} (@${p.username})? Esta acción no se puede deshacer.`)) return;
  if (button) { button.disabled = true; button.textContent = '…'; button.title = 'Eliminando…'; }
  try {
    await deletePlayer(id);
    state.players = state.players.filter(x=>x.id!==id);
    renderAdmin();
    renderPlayers();
    showToast('🗑️ Usuario eliminado');
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = '🗑️'; button.title = 'Eliminar usuario'; }
    showToast(`❌ ${error.message || 'No se pudo eliminar el usuario.'}`);
  }
}

// ============================================================
