// ADMIN
// ============================================================
let clubBrandDraftCrest;

function clubBrandPreviewHTML(crest, name) {
  const imageUrl = safeClubCrestUrl(crest);
  return imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="Escudo de ${escapeHtml(name)}">`
    : `<span>${escapeHtml(clubInitials(name))}</span>`;
}

function renderAdmin() {
  const clubInfo = document.getElementById('club-admin-info');
  if (clubInfo && state.currentClub) {
    clubBrandDraftCrest = undefined;
    const isSupport = !!state.currentUser?.supportMode;
    const invite = isSupport ? `
      <div class="club-brand-note is-support">🛡️ Modo soporte maestro · código de invitación oculto</div>` : `
      <div class="club-brand-invite"><div><b>Código de invitación</b><span>Compartilo para que entren al grupo.</span></div><button class="btn btn-gold btn-sm" onclick="copyClubInviteCode()">${escapeHtml(state.currentClub.inviteCode || '')}</button></div>`;
    clubInfo.innerHTML = `
      <div class="club-brand-editor">
        <div class="club-brand-preview" id="club-brand-preview">${clubBrandPreviewHTML(state.currentClub.crest, state.currentClub.name)}</div>
        <div class="club-brand-fields">
          <label for="club-brand-name">Nombre del club</label>
          <input id="club-brand-name" maxlength="50" value="${escapeHtml(state.currentClub.name)}" placeholder="Ej.: Los del Sábado">
          <label class="club-brand-upload" for="club-brand-crest-input">🖼️ Cambiar escudo <small>PNG, JPG o WEBP · se optimiza antes de guardar</small></label>
          <input id="club-brand-crest-input" type="file" accept="image/png,image/jpeg,image/webp" onchange="previewClubCrest(this)">
          <div class="club-brand-actions"><button class="btn btn-primary btn-sm" onclick="saveClubIdentity()">💾 Guardar identidad</button><button class="btn btn-ghost btn-sm" onclick="clearClubCrest()">↺ Usar iniciales</button></div>
        </div>
      </div>
      ${invite}`;
  }
  const list = document.getElementById('admin-players-list');
  list.innerHTML = state.players.map(p => `
    <div class="admin-player-row">
      <div style="font-size:20px">${posEmoji(getEffectivePosition(p))}</div>
      <div class="admin-player-name">${p.name} <span style="color:var(--muted);font-size:12px">@${p.username}</span>${p.isAdmin?' 👑':''}${p._resetRequested?' <span style="color:var(--red);font-size:11px">⚠️ pidió reset</span>':''}</div>
      <button class="btn-icon" title="${p.isAdmin?'Quitar admin':'Hacer admin'}" onclick="toggleAdmin('${p.id}')">${p.isAdmin?'👑':'⬜'}</button>
      <button class="btn-icon" title="Resetear contraseña a 1234" onclick="adminResetPassword('${p.id}')">🔑</button>
      <button class="btn-icon" title="Eliminar" onclick="removePlayer('${p.id}')">🗑️</button>
    </div>
  `).join('');
}

function updateClubBrandPreview(crest, name) {
  const preview = document.getElementById('club-brand-preview');
  if (preview) preview.innerHTML = clubBrandPreviewHTML(crest, name);
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
    const context = canvas.getContext('2d', { alpha: false });
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
      context.fillStyle = '#101923';
      context.fillRect(0, 0, currentSide, currentSide);
      context.drawImage(image, (currentSide - drawWidth) / 2, (currentSide - drawHeight) / 2, drawWidth, drawHeight);
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
    updateClubBrandPreview(clubBrandDraftCrest, document.getElementById('club-brand-name')?.value || state.currentClub.name);
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
  updateClubBrandPreview(null, document.getElementById('club-brand-name')?.value || state.currentClub?.name || 'FC');
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
    SESSION.set({ ...state.currentUser, clubName: freshClub.name, clubCrest: freshClub.crest || null });
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
  const code = state.currentClub?.inviteCode;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast(`✅ Código ${code} copiado`);
  } catch {
    showToast(`Código del club: ${code}`, 4000);
  }
}

async function removePlayer(id) {
  const p = state.players.find(x=>x.id===id);
  if (!p) return;
  if (!confirm(`¿Eliminar a ${p.name}?`)) return;
  state.players = state.players.filter(x=>x.id!==id);
  await deletePlayer(id);
  renderAdmin();
  renderPlayers();
  showToast('🗑️ Jugador eliminado');
}

// ============================================================
