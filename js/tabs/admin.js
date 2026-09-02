// ADMIN
// ============================================================
let clubBrandDraftCrest;
let clubBrandDraftName = '';
let clubBrandDraftClubId = null;
let clubCrestDesignerOpen = false;
let clubCrestDesign = null;
let clubInviteEditorOpen = false;
let pendingClubScheduleUpdate = null;

function clubBrandPreviewHTML(crest, name) {
  const imageUrl = safeClubCrestUrl(crest);
  return imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="Escudo de ${escapeHtml(name)}">`
    : `<span>${escapeHtml(clubInitials(name))}</span>`;
}

function clubMatchScheduleEditorHTML(isSupport) {
  const schedule = getClubSchedule();
  if (isSupport) {
    return `<div class="club-match-schedule is-readonly"><div><b>📅 Partido semanal</b><span>${schedule ? `${escapeHtml(clubNextMatchText())} · ${escapeHtml(schedule.venue)}` : 'Este club todavía no configuró un día, horario y sede.'}</span></div></div>`;
  }
  const weekdayOptions = CLUB_WEEKDAYS.map((label, value) => `<option value="${value}" ${schedule?.weekday === value ? 'selected' : ''}>${label.charAt(0).toUpperCase()}${label.slice(1)}</option>`).join('');
  return `<div class="club-match-schedule">
    <div class="club-match-schedule-head"><div><b>📅 Próximo partido</b><span>Se actualiza solo con la fecha de cada semana.</span></div></div>
    <div class="club-match-schedule-fields">
      <label>Día<select id="club-match-weekday"><option value="">Sin configurar</option>${weekdayOptions}</select></label>
      <label>Hora<input id="club-match-time" type="time" value="${escapeHtml(schedule?.time || '')}"></label>
      <label class="club-match-venue">Nombre de la cancha<input id="club-match-venue" maxlength="80" value="${escapeHtml(schedule?.venue || '')}" placeholder="Ej.: Stallion Adrogué"></label>
      <label class="club-match-address">Dirección para Maps <small>No se muestra en Inicio.</small><input id="club-match-address" maxlength="140" value="${escapeHtml(schedule?.address || '')}" placeholder="Ej.: Av. Hipólito Yrigoyen 1234, Adrogué"></label>
    </div>
    <div class="club-match-schedule-actions"><button class="btn btn-primary btn-sm" onclick="requestClubMatchScheduleSave()">💾 Guardar partido semanal</button>${schedule ? '<button class="btn btn-ghost btn-sm" onclick="clearClubMatchSchedule()">Quitar configuración</button>' : ''}</div>
  </div>`;
}

function renderAdmin() {
  const clubInfo = document.getElementById('club-admin-info');
  if (clubInfo && state.currentClub) {
    if (clubBrandDraftClubId !== state.currentClub.id) {
      clubBrandDraftClubId = state.currentClub.id;
      clubBrandDraftCrest = undefined;
      clubBrandDraftName = '';
      clubCrestDesignerOpen = false;
      clubCrestDesign = null;
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
          <div class="club-brand-actions"><button class="btn btn-ghost btn-sm" onclick="toggleClubCrestDesigner()">🎨 Diseñar escudo</button><button class="btn btn-primary btn-sm" onclick="saveClubIdentity()">💾 Guardar identidad</button><button class="btn btn-ghost btn-sm" onclick="clearClubCrest()">↺ Usar iniciales</button></div>
        </div>
      </div>
      ${clubCrestDesignerOpen ? clubCrestDesignerHTML(draftName) : ''}
      ${invite}
      ${clubMatchScheduleEditorHTML(isSupport)}`;
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
          <button class="btn-icon" title="Eliminar usuario" onclick="removePlayer('${p.id}')">🗑️</button>
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

const CLUB_CREST_TEMPLATES = [
  ['classic', 'Clásico'],
  ['stripes', 'Rayas'],
  ['diagonal', 'Diagonal'],
  ['split', 'Mitad'],
  ['chevron', 'Chevron'],
  ['hoops', 'Aros']
];
const CLUB_CREST_EMBLEMS = [
  ['monogram', 'Iniciales'],
  ['star', 'Estrella'],
  ['ball', 'Pelota'],
  ['crown', 'Corona'],
  ['bolt', 'Rayo']
];

function validCrestColor(value, fallback) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function defaultClubCrestDesign(name) {
  return {
    template: 'classic',
    primary: '#163f8c',
    secondary: '#f3c746',
    emblem: 'monogram',
    initials: clubInitials(name)
  };
}

function normalizedClubCrestDesign(design, fallbackName) {
  const source = design || defaultClubCrestDesign(fallbackName);
  const template = CLUB_CREST_TEMPLATES.some(([value]) => value === source.template) ? source.template : 'classic';
  const emblem = CLUB_CREST_EMBLEMS.some(([value]) => value === source.emblem) ? source.emblem : 'monogram';
  return {
    template,
    emblem,
    primary: validCrestColor(source.primary, '#163f8c'),
    secondary: validCrestColor(source.secondary, '#f3c746'),
    initials: safePlainText(source.initials || clubInitials(fallbackName), 3).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'FC'
  };
}

function clubCrestDesignerHTML(name) {
  const design = normalizedClubCrestDesign(clubCrestDesign, name);
  clubCrestDesign = design;
  const templateChoices = CLUB_CREST_TEMPLATES.map(([value, label]) => `<button type="button" class="club-crest-template ${design.template === value ? 'selected' : ''}" data-crest-template="${value}" onclick="selectClubCrestTemplate('${value}')"><span class="crest-mini crest-mini-${value}"></span>${label}</button>`).join('');
  const emblemChoices = CLUB_CREST_EMBLEMS.map(([value, label]) => `<button type="button" class="club-crest-emblem ${design.emblem === value ? 'selected' : ''}" data-crest-emblem="${value}" onclick="selectClubCrestEmblem('${value}')">${clubCrestEmblemGlyph(value)}<span>${label}</span></button>`).join('');
  return `<section class="club-crest-designer" aria-label="Diseñador de escudo">
    <div class="club-crest-designer-head"><div><b>🎨 Diseñá el escudo</b><span>Elegí un molde, colores y emblema. Se aplica a la vista previa hasta que guardes la identidad.</span></div><button class="btn-icon" type="button" title="Cerrar diseñador" onclick="toggleClubCrestDesigner(false)">✕</button></div>
    <div class="club-crest-designer-grid">
      <div class="club-crest-live"><div class="club-crest-live-frame" id="club-crest-designer-preview"></div><small>Vista previa</small></div>
      <div class="club-crest-controls">
        <fieldset><legend>Molde</legend><div class="club-crest-choice-grid">${templateChoices}</div></fieldset>
        <fieldset><legend>Colores</legend><div class="club-crest-colors"><label>Principal<input id="club-crest-primary" type="color" value="${design.primary}" oninput="updateClubCrestDesign()"></label><label>Detalle<input id="club-crest-secondary" type="color" value="${design.secondary}" oninput="updateClubCrestDesign()"></label><label>Iniciales<input id="club-crest-initials" maxlength="3" value="${escapeHtml(design.initials)}" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);updateClubCrestDesign()"></label></div></fieldset>
        <fieldset><legend>Emblema</legend><div class="club-crest-emblem-grid">${emblemChoices}</div></fieldset>
      </div>
    </div>
    <div class="club-crest-designer-actions"><button type="button" class="btn btn-primary btn-sm" onclick="applyClubCrestDesign()">✓ Usar este escudo</button><button type="button" class="btn btn-ghost btn-sm" onclick="resetClubCrestDesign()">↺ Reiniciar diseño</button></div>
  </section>`;
}

function clubCrestEmblemGlyph(emblem) {
  return ({ monogram: 'FC', star: '★', ball: '⚽', crown: '♛', bolt: 'ϟ' })[emblem] || 'FC';
}

function toggleClubCrestDesigner(forceOpen) {
  const next = typeof forceOpen === 'boolean' ? forceOpen : !clubCrestDesignerOpen;
  clubCrestDesignerOpen = next;
  if (next && !clubCrestDesign) clubCrestDesign = defaultClubCrestDesign(clubBrandDraftName || state.currentClub?.name || 'FC');
  renderAdmin();
  if (next) updateClubCrestDesign();
}

function readClubCrestDesignInputs() {
  const fallbackName = clubBrandDraftName || document.getElementById('club-brand-name')?.value || state.currentClub?.name || 'FC';
  const design = normalizedClubCrestDesign(clubCrestDesign, fallbackName);
  const primary = document.getElementById('club-crest-primary')?.value;
  const secondary = document.getElementById('club-crest-secondary')?.value;
  const initials = document.getElementById('club-crest-initials')?.value;
  return normalizedClubCrestDesign({ ...design, primary, secondary, initials }, fallbackName);
}

function selectClubCrestTemplate(template) {
  clubCrestDesign = { ...readClubCrestDesignInputs(), template };
  updateClubCrestDesign();
}

function selectClubCrestEmblem(emblem) {
  clubCrestDesign = { ...readClubCrestDesignInputs(), emblem };
  updateClubCrestDesign();
}

function updateClubCrestDesign() {
  if (!clubCrestDesignerOpen) return;
  clubCrestDesign = readClubCrestDesignInputs();
  const preview = document.getElementById('club-crest-designer-preview');
  if (preview) preview.innerHTML = clubCrestDesignSvg(clubCrestDesign);
  document.querySelectorAll('[data-crest-template]').forEach(button => button.classList.toggle('selected', button.dataset.crestTemplate === clubCrestDesign.template));
  document.querySelectorAll('[data-crest-emblem]').forEach(button => button.classList.toggle('selected', button.dataset.crestEmblem === clubCrestDesign.emblem));
}

function clubCrestDesignSvg(rawDesign) {
  const design = normalizedClubCrestDesign(rawDesign, state.currentClub?.name || 'FC');
  const { primary, secondary, template, emblem, initials } = design;
  const shapes = {
    classic: 'M160 10 L294 54 L274 278 Q258 365 160 414 Q62 365 46 278 L26 54 Z',
    stripes: 'M160 12 L294 57 L278 273 Q265 358 160 412 Q55 358 42 273 L26 57 Z',
    diagonal: 'M160 18 C239 18 292 69 292 148 L276 263 Q262 353 160 412 Q58 353 44 263 L28 148 C28 69 81 18 160 18 Z',
    split: 'M47 35 H273 V255 Q259 351 160 414 Q61 351 47 255 Z',
    chevron: 'M160 10 L300 72 L268 282 Q251 365 160 414 Q69 365 52 282 L20 72 Z',
    hoops: 'M160 17 A143 143 0 1 1 159.9 17 Z'
  };
  const clip = shapes[template] || shapes.classic;
  const patterns = {
    classic: `<path d="M0 0H320V430H0Z" fill="${primary}"/><path d="M118 0H202V430H118Z" fill="${secondary}"/>`,
    stripes: `<path d="M0 0H320V430H0Z" fill="${primary}"/><path d="M45 0H88V430H45ZM138 0H181V430H138ZM231 0H274V430H231Z" fill="${secondary}"/>`,
    diagonal: `<path d="M0 0H320V430H0Z" fill="${primary}"/><path d="M-48 286L260 -10H360L52 430H-48Z" fill="${secondary}"/>`,
    split: `<path d="M0 0H160V430H0Z" fill="${primary}"/><path d="M160 0H320V430H160Z" fill="${secondary}"/>`,
    chevron: `<path d="M0 0H320V430H0Z" fill="${primary}"/><path d="M0 0H320V92L160 260L0 92Z" fill="${secondary}"/>`,
    hoops: `<path d="M0 0H320V430H0Z" fill="${primary}"/><path d="M0 62H320V122H0ZM0 205H320V265H0ZM0 348H320V408H0Z" fill="${secondary}"/>`
  };
  const glyph = emblem === 'monogram'
    ? `<text x="160" y="244" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="104" letter-spacing="-8" fill="#fff">${escapeHtml(initials)}</text>`
    : emblem === 'star'
      ? '<path d="M160 112L184 168L245 173L198 213L213 274L160 242L107 274L122 213L75 173L136 168Z" fill="#fff"/>'
      : emblem === 'ball'
        ? '<circle cx="160" cy="205" r="72" fill="#fff"/><path d="M160 153l28 20-11 34h-34l-11-34zm-49 16l32 4m66 0l32-4m-110 77l27-17m75 0l27 17m-128-18l-9 33m111-33l9 33" fill="none" stroke="#101826" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>'
        : emblem === 'crown'
          ? '<path d="M78 259L94 150L136 192L160 122L184 192L226 150L242 259Z" fill="#fff"/><path d="M77 278H243" stroke="#fff" stroke-width="25"/>'
          : '<path d="M185 106L101 236H154L133 321L222 184H168Z" fill="#fff"/>';
  return `<svg viewBox="0 0 320 430" role="img" aria-label="Vista previa del escudo" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="crestShape"><path d="${clip}"/></clipPath><filter id="crestShadow" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="8" flood-opacity=".34"/></filter></defs><g filter="url(#crestShadow)"><path d="${clip}" fill="#101622" stroke="${secondary}" stroke-width="14" stroke-linejoin="round"/><g clip-path="url(#crestShape)">${patterns[template]}</g><path d="${clip}" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="3" stroke-linejoin="round"/><g>${glyph}</g><path d="M88 310H232" stroke="${secondary}" stroke-width="8" stroke-linecap="round"/></g></svg>`;
}

async function makeDesignedClubCrest(rawDesign) {
  const svg = clubCrestDesignSvg(rawDesign);
  const image = await new Promise((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => resolve(candidate);
    candidate.onerror = () => reject(new Error('No pudimos generar el escudo.'));
    candidate.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 430;
  const context = canvas.getContext('2d', { alpha: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', .9);
}

async function applyClubCrestDesign() {
  const button = document.querySelector('.club-crest-designer-actions .btn-primary');
  clubCrestDesign = readClubCrestDesignInputs();
  if (button) { button.disabled = true; button.textContent = 'Diseñando…'; }
  try {
    clubBrandDraftCrest = await makeDesignedClubCrest(clubCrestDesign);
    const name = clubBrandDraftName || document.getElementById('club-brand-name')?.value || state.currentClub?.name || 'FC';
    updateClubBrandPreview(clubBrandDraftCrest, name);
    clubCrestDesignerOpen = false;
    renderAdmin();
    showToast('✅ Escudo diseñado. Guardá la identidad para publicarlo.');
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = '✓ Usar este escudo'; }
    showToast(`❌ ${error.message || 'No pudimos generar el escudo.'}`);
  }
}

function resetClubCrestDesign() {
  clubCrestDesign = defaultClubCrestDesign(clubBrandDraftName || document.getElementById('club-brand-name')?.value || state.currentClub?.name || 'FC');
  renderAdmin();
  updateClubCrestDesign();
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

let pendingClubIdentityUpdate = null;
let pendingClubInviteCode = null;
let pendingAdminPasswordPlayerId = null;

function saveClubIdentity() {
  if (!state.currentUser?.isAdmin || !state.currentClub) return;
  const nameInput = document.getElementById('club-brand-name');
  const nextName = safePlainText(nameInput?.value, 50).trim();
  if (nextName.length < 3) {
    showToast('⚠️ El nombre debe tener al menos 3 caracteres.');
    return;
  }
  const crest = clubBrandDraftCrest === undefined ? state.currentClub.crest : clubBrandDraftCrest;
  pendingClubIdentityUpdate = { name: nextName, crest };
  document.getElementById('modal-club-confirm-content').innerHTML = `
    <p style="color:var(--muted);line-height:1.5;margin-bottom:16px">Esta identidad será visible para todos los integrantes del club.</p>
    <div style="padding:12px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.035);margin-bottom:20px"><span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Nuevo nombre</span><strong style="display:block;font-size:17px;margin-top:4px">${escapeHtml(nextName)}</strong>${crest !== state.currentClub.crest ? '<span style="display:block;color:var(--lime);font-size:12px;margin-top:7px">✓ También se actualizará el escudo.</span>' : ''}</div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button class="btn btn-ghost" onclick="cancelClubConfirmation()">Cancelar</button><button class="btn btn-primary" id="confirm-club-change" onclick="confirmClubIdentitySave()">Guardar cambios</button></div>`;
  openModal('modal-club-confirm');
}

function cancelClubConfirmation() {
  pendingClubIdentityUpdate = null;
  pendingClubInviteCode = null;
  pendingClubScheduleUpdate = null;
  closeModal('modal-club-confirm');
}

function requestClubMatchScheduleSave() {
  if (!state.currentUser?.isAdmin || !state.currentClub) return;
  const weekdayValue = document.getElementById('club-match-weekday')?.value ?? '';
  const matchTime = document.getElementById('club-match-time')?.value || '';
  const matchVenue = safePlainText(document.getElementById('club-match-venue')?.value || '', 80).trim();
  const matchAddress = safePlainText(document.getElementById('club-match-address')?.value || '', 140).trim();
  const noSchedule = weekdayValue === '' && !matchTime && !matchVenue && !matchAddress;
  if (!noSchedule && (weekdayValue === '' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(matchTime) || matchVenue.length < 2)) {
    showToast('⚠️ Para fijar el partido completá día, hora y sede.');
    return;
  }
  pendingClubScheduleUpdate = noSchedule ? { weekday: null, time: null, venue: null, address: null } : { weekday: Number(weekdayValue), time: matchTime, venue: matchVenue, address: matchAddress };
  const detail = noSchedule ? 'Se quitará el partido semanal configurado para este club.' : `${CLUB_WEEKDAYS[pendingClubScheduleUpdate.weekday].replace(/^./, c => c.toUpperCase())} · ${pendingClubScheduleUpdate.time} · ${pendingClubScheduleUpdate.venue}`;
  document.getElementById('modal-club-confirm-content').innerHTML = `
    <p style="color:var(--muted);line-height:1.5;margin-bottom:16px">Esta información se mostrará en el Inicio para todos los integrantes del club.</p>
    <div style="padding:13px;border:1px solid rgba(182,242,61,.32);border-radius:10px;background:rgba(182,242,61,.08);margin-bottom:20px"><span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Partido semanal</span><strong style="display:block;font-size:17px;margin-top:4px">${escapeHtml(detail)}</strong></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button class="btn btn-ghost" onclick="cancelClubConfirmation()">Cancelar</button><button class="btn btn-primary" id="confirm-club-change" onclick="confirmClubMatchScheduleSave()">Guardar configuración</button></div>`;
  openModal('modal-club-confirm');
}

function clearClubMatchSchedule() {
  const weekday = document.getElementById('club-match-weekday');
  const time = document.getElementById('club-match-time');
  const venue = document.getElementById('club-match-venue');
  const address = document.getElementById('club-match-address');
  if (weekday) weekday.value = '';
  if (time) time.value = '';
  if (venue) venue.value = '';
  if (address) address.value = '';
  requestClubMatchScheduleSave();
}

async function confirmClubMatchScheduleSave() {
  const update = pendingClubScheduleUpdate;
  if (!update) { cancelClubConfirmation(); return; }
  const button = document.getElementById('confirm-club-change');
  if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
  try {
    const freshClub = await saveClubMatchSchedule(update.weekday, update.time, update.venue, update.address);
    state.currentClub = { ...state.currentClub, ...freshClub };
    const known = state.clubs.find(club => club.id === freshClub.id);
    if (known) Object.assign(known, freshClub);
    KNOWN_CLUBS.remember(state.currentClub);
    SESSION.set({ ...state.currentUser, clubName: freshClub.name, clubCrest: freshClub.crest || null, clubInviteCode: state.currentUser.isAdmin ? freshClub.inviteCode || null : null, clubMatchWeekday: freshClub.matchWeekday, clubMatchTime: freshClub.matchTime, clubMatchVenue: freshClub.matchVenue, clubMatchAddress: freshClub.matchAddress });
    pendingClubScheduleUpdate = null;
    closeModal('modal-club-confirm');
    renderHub();
    renderAdmin();
    showToast(update.weekday === null ? '✅ Partido semanal quitado' : '✅ Próximo partido configurado');
  } catch (error) {
    const message = error.message || 'No se pudo guardar el partido semanal.';
    if (button) { button.disabled = false; button.textContent = 'Guardar configuración'; }
    document.getElementById('club-confirm-error')?.remove();
    document.getElementById('modal-club-confirm-content')?.insertAdjacentHTML('afterbegin', `<p id="club-confirm-error" style="color:#fda4af;line-height:1.4;margin-bottom:14px">❌ ${escapeHtml(message)}</p>`);
    showToast(`❌ ${message}`);
  }
}

async function confirmClubIdentitySave() {
  const update = pendingClubIdentityUpdate;
  if (!update) { cancelClubConfirmation(); return; }
  const button = document.getElementById('confirm-club-change');
  if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
  try {
    const freshClub = await saveClubBrand(update.name, update.crest);
    state.currentClub = { ...state.currentClub, ...freshClub };
    const known = state.clubs.find(club => club.id === freshClub.id);
    if (known) Object.assign(known, freshClub);
    KNOWN_CLUBS.remember(state.currentClub);
    SESSION.set({ ...state.currentUser, clubName: freshClub.name, clubCrest: freshClub.crest || null, clubInviteCode: state.currentUser.isAdmin ? freshClub.inviteCode || null : null });
    clubBrandDraftCrest = undefined;
    clubBrandDraftName = '';
    clubBrandDraftClubId = state.currentClub.id;
    pendingClubIdentityUpdate = null;
    closeModal('modal-club-confirm');
    renderClubIdentity();
    renderHub();
    renderAdmin();
    showToast('✅ Identidad del club actualizada para todo el grupo');
  } catch (error) {
    const message = error.message || 'No se pudo guardar la identidad.';
    showToast(`❌ ${message}`);
    if (button) { button.disabled = false; button.textContent = 'Guardar cambios'; }
    document.getElementById('club-confirm-error')?.remove();
    document.getElementById('modal-club-confirm-content')?.insertAdjacentHTML('afterbegin', `<p id="club-confirm-error" style="color:#fda4af;line-height:1.4;margin-bottom:14px">❌ ${escapeHtml(message)}</p>`);
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

function saveClubInviteCode() {
  if (!state.currentUser?.isAdmin || !state.currentClub) return;
  const input = document.getElementById('club-invite-code-input');
  const nextCode = safePlainText(input?.value, 16).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!/^[A-Z0-9][A-Z0-9-]{3,15}$/.test(nextCode)) {
    showToast('⚠️ Usá entre 4 y 16 letras, números o guiones.');
    return;
  }
  pendingClubInviteCode = nextCode;
  document.getElementById('modal-club-confirm-content').innerHTML = `
    <p style="color:var(--muted);line-height:1.5;margin-bottom:16px">El código anterior dejará de permitir registros en este club.</p>
    <div style="padding:13px;border:1px solid rgba(240,192,64,.35);border-radius:10px;background:rgba(240,192,64,.08);margin-bottom:20px;text-align:center"><span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Nuevo código</span><strong style="display:block;color:var(--gold);font-size:24px;letter-spacing:.12em;margin-top:4px">${escapeHtml(nextCode)}</strong></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button class="btn btn-ghost" onclick="cancelClubConfirmation()">Cancelar</button><button class="btn btn-primary" id="confirm-club-change" onclick="confirmClubInviteCodeSave()">Cambiar código</button></div>`;
  openModal('modal-club-confirm');
}

async function confirmClubInviteCodeSave() {
  const nextCode = pendingClubInviteCode;
  if (!nextCode) { cancelClubConfirmation(); return; }
  const button = document.getElementById('confirm-club-change');
  if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
  try {
    const freshClub = await updateClubInviteCode(nextCode);
    state.currentClub = { ...state.currentClub, ...freshClub };
    const known = state.clubs.find(club => club.id === freshClub.id);
    if (known) Object.assign(known, freshClub);
    SESSION.set({ ...state.currentUser, clubName: state.currentClub.name, clubCrest: state.currentClub.crest || null, clubInviteCode: nextCode });
    clubInviteEditorOpen = false;
    pendingClubInviteCode = null;
    closeModal('modal-club-confirm');
    renderAdmin();
    showToast('✅ Código actualizado. El anterior ya no permite ingresar.');
  } catch (error) {
    const message = error.message || 'No se pudo cambiar el código.';
    showToast(`❌ ${message}`);
    if (button) { button.disabled = false; button.textContent = 'Cambiar código'; }
    document.getElementById('club-confirm-error')?.remove();
    document.getElementById('modal-club-confirm-content')?.insertAdjacentHTML('afterbegin', `<p id="club-confirm-error" style="color:#fda4af;line-height:1.4;margin-bottom:14px">❌ ${escapeHtml(message)}</p>`);
  }
}

function openAdminPasswordDialog(id) {
  const p = state.players.find(x=>x.id===id);
  if (!p) return;
  if (p.id === state.currentUser?.id) { showToast('⚠️ Tu contraseña se cambia desde Mi perfil.'); return; }
  pendingAdminPasswordPlayerId = id;
  document.getElementById('modal-admin-password-content').innerHTML = `
    <p style="color:var(--muted);line-height:1.5;margin-bottom:16px">Nueva contraseña para <strong style="color:var(--text)">${escapeHtml(p.name)}</strong> <span style="color:var(--muted)">(@${escapeHtml(p.username)})</span>.</p>
    <label for="admin-new-password" style="display:block;font-size:12px;font-weight:700;margin-bottom:7px">Nueva contraseña</label>
    <input id="admin-new-password" type="password" minlength="6" maxlength="128" autocomplete="new-password" placeholder="Entre 6 y 128 caracteres" style="width:100%;margin-bottom:20px">
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button class="btn btn-ghost" onclick="cancelAdminPasswordDialog()">Cancelar</button><button class="btn btn-primary" id="confirm-admin-password" onclick="confirmAdminPasswordChange()">Cambiar contraseña</button></div>`;
  openModal('modal-admin-password');
  setTimeout(() => document.getElementById('admin-new-password')?.focus(), 0);
}

function cancelAdminPasswordDialog() {
  pendingAdminPasswordPlayerId = null;
  closeModal('modal-admin-password');
}

async function confirmAdminPasswordChange() {
  const id = pendingAdminPasswordPlayerId;
  const p = state.players.find(x=>x.id===id);
  const newPassword = document.getElementById('admin-new-password')?.value || '';
  if (!p) { cancelAdminPasswordDialog(); return; }
  if (newPassword.length < 6 || newPassword.length > 128) { showToast('⚠️ La contraseña debe tener entre 6 y 128 caracteres.'); return; }
  const button = document.getElementById('confirm-admin-password');
  if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
  try {
    await adminSetPlayerPassword(id, newPassword);
    p._resetRequested = false;
    pendingAdminPasswordPlayerId = null;
    closeModal('modal-admin-password');
    renderAdmin();
    showToast(`🔑 Contraseña actualizada para ${p.username}`);
  } catch (error) {
    const message = error.message || 'No se pudo cambiar la contraseña.';
    if (button) { button.disabled = false; button.textContent = 'Cambiar contraseña'; }
    showToast(`❌ ${message}`);
  }
}

let pendingPlayerRemovalId = null;

function removePlayer(id) {
  const p = state.players.find(x=>x.id===id);
  if (!p) return;
  if (p.id === state.currentUser?.id) { showToast('⚠️ No podés eliminar tu propia cuenta desde acá.'); return; }
  const admins = state.players.filter(player => player.isAdmin);
  if (p.isAdmin && admins.length <= 1) {
    showToast('⚠️ No se puede eliminar al último administrador. Primero asigná otro admin.');
    return;
  }
  pendingPlayerRemovalId = id;
  document.getElementById('modal-delete-player-content').innerHTML = `
    <p style="color:var(--muted);line-height:1.5;margin-bottom:18px">Vas a eliminar a <strong style="color:var(--text)">${escapeHtml(p.name)}</strong> <span style="color:var(--muted)">(@${escapeHtml(p.username)})</span>.</p>
    <p style="color:#fda4af;font-size:13px;line-height:1.45;margin-bottom:20px">No podrá volver a ingresar con esa cuenta. Esta acción no se puede deshacer.</p>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="cancelPlayerRemoval()">Cancelar</button>
      <button class="btn btn-danger" id="confirm-delete-player" onclick="confirmPlayerRemoval()">🗑️ Eliminar usuario</button>
    </div>`;
  openModal('modal-delete-player');
}

function cancelPlayerRemoval() {
  pendingPlayerRemovalId = null;
  closeModal('modal-delete-player');
}

async function confirmPlayerRemoval() {
  const id = pendingPlayerRemovalId;
  const p = state.players.find(x=>x.id===id);
  if (!p) { cancelPlayerRemoval(); return; }
  const button = document.getElementById('confirm-delete-player');
  if (button) { button.disabled = true; button.textContent = 'Eliminando…'; }
  try {
    await deletePlayer(id);
    state.players = state.players.filter(x=>x.id!==id);
    pendingPlayerRemovalId = null;
    closeModal('modal-delete-player');
    renderAdmin();
    renderPlayers();
    showToast('🗑️ Usuario eliminado');
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = '🗑️ Eliminar usuario'; }
    const message = error.message || 'No se pudo eliminar el usuario.';
    const content = document.getElementById('modal-delete-player-content');
    const existingError = document.getElementById('delete-player-error');
    if (existingError) existingError.textContent = `❌ ${message}`;
    else if (content) content.insertAdjacentHTML('afterbegin', `<p id="delete-player-error" style="color:#fda4af;line-height:1.4;margin-bottom:14px">❌ ${escapeHtml(message)}</p>`);
    showToast(`❌ ${message}`);
  }
}

// ============================================================
