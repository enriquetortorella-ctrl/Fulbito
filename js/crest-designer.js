// CREST STUDIO — editor visual por capas para la identidad del club
// Se carga después de tabs/admin.js y reemplaza el editor básico original.
// ============================================================

const PRO_CREST_SHAPES = [
  { id: 'heritage', label: 'Heritage', path: 'M180 12 L326 61 L307 286 Q289 383 180 430 Q71 383 53 286 L34 61 Z' },
  { id: 'english', label: 'Inglés', path: 'M180 16 C258 16 322 48 322 120 V274 Q306 380 180 430 Q54 380 38 274 V120 C38 48 102 16 180 16 Z' },
  { id: 'spanish', label: 'Español', path: 'M44 42 Q180 2 316 42 L300 286 Q282 382 180 430 Q78 382 60 286 Z' },
  { id: 'italian', label: 'Italiano', path: 'M49 30 H311 V275 Q298 371 180 430 Q62 371 49 275 Z' },
  { id: 'royal', label: 'Royal', path: 'M180 11 L330 70 L289 161 L316 286 Q286 390 180 430 Q74 390 44 286 L71 161 L30 70 Z' },
  { id: 'roundel', label: 'Circular', path: 'M180 50 A165 165 0 1 1 179.9 50 Z' },
  { id: 'diamond', label: 'Diamante', path: 'M180 10 L330 157 L180 430 L30 157 Z' },
  { id: 'hexagon', label: 'Hexagonal', path: 'M92 24 H268 L337 142 L294 339 L180 430 L66 339 L23 142 Z' },
  { id: 'pennant', label: 'Banderín', path: 'M48 28 H312 V302 L180 430 L48 302 Z' },
  { id: 'fortress', label: 'Fortaleza', path: 'M39 38 H104 V78 H148 V38 H212 V78 H256 V38 H321 V292 Q292 386 180 430 Q68 386 39 292 Z' }
];

const PRO_CREST_PATTERNS = [
  ['solid', 'Liso'], ['center', 'Franja'], ['stripes', 'Rayas'], ['pinstripes', 'Finas'],
  ['split', 'Mitades'], ['quarters', 'Cuartos'], ['diagonal', 'Diagonal'], ['sash', 'Banda'],
  ['chevron', 'Chevron'], ['hoops', 'Aros'], ['horizon', 'Horizontal'], ['rays', 'Rayos']
];

const PRO_CREST_EMBLEMS = [
  ['monogram', 'Iniciales'], ['ball', 'Pelota'], ['star', 'Estrella'], ['crown', 'Corona'],
  ['bolt', 'Rayo'], ['wings', 'Alas'], ['flame', 'Fuego'], ['trophy', 'Copa'],
  ['tower', 'Torre'], ['anchor', 'Ancla'], ['diamond', 'Gema'], ['laurel', 'Laureles']
];

const PRO_CREST_PALETTES = [
  { name: 'Noche dorada', colors: ['#071a35', '#e7b83e', '#fff3c4'] },
  { name: 'Celeste campeón', colors: ['#66c7ed', '#f7fbff', '#d6a936'] },
  { name: 'Rojo y negro', colors: ['#b8162a', '#10131a', '#f2c45c'] },
  { name: 'Verde clásico', colors: ['#087f4d', '#f4f0dd', '#d5ad42'] },
  { name: 'Violeta imperial', colors: ['#5f238c', '#16121f', '#d7b04f'] },
  { name: 'Borgoña', colors: ['#741f36', '#f2dfb7', '#c99a37'] },
  { name: 'Marino y rojo', colors: ['#132d57', '#d62f45', '#f3e8cf'] },
  { name: 'Naranja carbón', colors: ['#ed6b22', '#1b212a', '#f6d365'] },
  { name: 'Esmeralda', colors: ['#004d45', '#27c897', '#eefbf5'] },
  { name: 'Blanco real', colors: ['#eef2f5', '#28354a', '#d4a942'] },
  { name: 'Rosa urbano', colors: ['#e55189', '#20223d', '#8fe8e0'] },
  { name: 'Mármol', colors: ['#17131c', '#8b168d', '#f2f0ed'] }
];

const PRO_CREST_BORDERS = [['clean', 'Limpio'], ['double', 'Doble'], ['champion', 'Campeón'], ['silver', 'Plata'], ['neon', 'Neón']];
const PRO_CREST_FINISHES = [['flat', 'Mate'], ['metal', 'Metal'], ['carbon', 'Carbono']];
let proCrestHistory = [];
let proCrestHistoryIndex = -1;
let proCrestReturnFocus = null;

function proCrestFocusableElements() {
  const modal = document.getElementById('modal-crest-designer');
  if (!modal) return [];
  return Array.from(modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
    .filter(element => element.getClientRects().length && element.getAttribute('aria-hidden') !== 'true');
}

function handleProCrestKeydown(event) {
  if (!clubCrestDesignerOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleClubCrestDesigner(false);
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = proCrestFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function activateProCrestModal() {
  proCrestReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.getElementById('modal-crest-designer')?.querySelector('.crest-studio-close')?.focus();
  document.querySelectorAll('body > .screen').forEach(screen => {
    screen.inert = true;
    screen.setAttribute('aria-hidden', 'true');
  });
  document.body.classList.add('crest-studio-open');
  document.addEventListener('keydown', handleProCrestKeydown);
}

function deactivateProCrestModal({ restoreFocus = true } = {}) {
  document.removeEventListener('keydown', handleProCrestKeydown);
  document.body.classList.remove('crest-studio-open');
  document.querySelectorAll('body > .screen').forEach(screen => {
    screen.inert = false;
    screen.removeAttribute('aria-hidden');
  });
  const returnTarget = proCrestReturnFocus?.isConnected ? proCrestReturnFocus : document.getElementById('open-crest-studio');
  proCrestReturnFocus = null;
  if (restoreFocus) window.requestAnimationFrame(() => returnTarget?.focus());
}

function proCrestHas(collection, value) {
  return collection.some(item => (item.id || item[0]) === value);
}

function validCrestColor(value, fallback) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function defaultClubCrestDesign(name) {
  return {
    version: 2,
    shape: 'heritage',
    pattern: 'stripes',
    primary: '#071a35',
    secondary: '#e7b83e',
    accent: '#fff3c4',
    border: 'double',
    finish: 'metal',
    emblem: 'monogram',
    initials: clubInitials(name),
    year: '',
    stars: 1,
    emblemScale: 100,
    emblemY: 0,
    plate: true
  };
}

function normalizedClubCrestDesign(design, fallbackName) {
  const base = defaultClubCrestDesign(fallbackName);
  const source = design && typeof design === 'object' ? design : {};
  const initials = safePlainText(source.initials || base.initials, 3).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'FC';
  const year = /^\d{4}$/.test(String(source.year || '')) ? String(source.year) : '';
  return {
    version: 2,
    shape: proCrestHas(PRO_CREST_SHAPES, source.shape) ? source.shape : base.shape,
    pattern: proCrestHas(PRO_CREST_PATTERNS, source.pattern) ? source.pattern : base.pattern,
    primary: validCrestColor(source.primary, base.primary),
    secondary: validCrestColor(source.secondary, base.secondary),
    accent: validCrestColor(source.accent, base.accent),
    border: proCrestHas(PRO_CREST_BORDERS, source.border) ? source.border : base.border,
    finish: proCrestHas(PRO_CREST_FINISHES, source.finish) ? source.finish : base.finish,
    emblem: proCrestHas(PRO_CREST_EMBLEMS, source.emblem) ? source.emblem : base.emblem,
    initials,
    year,
    stars: Math.max(0, Math.min(3, Number(source.stars) || 0)),
    emblemScale: Math.max(72, Math.min(128, Number(source.emblemScale) || 100)),
    emblemY: Math.max(-38, Math.min(38, Number(source.emblemY) || 0)),
    plate: source.plate !== false
  };
}

function proCrestShape(id) {
  return PRO_CREST_SHAPES.find(shape => shape.id === id) || PRO_CREST_SHAPES[0];
}

function proCrestShapeThumb(shape) {
  return `<svg viewBox="0 0 360 440" aria-hidden="true"><path d="${shape.path}" fill="#182842" stroke="currentColor" stroke-width="17"/><path d="${shape.path}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="5"/></svg>`;
}

function proCrestEmblemIcon(id) {
  const art = {
    monogram: '<text x="20" y="29" text-anchor="middle">FC</text>',
    ball: '<circle cx="20" cy="20" r="12"/><path d="M20 12l5 4-2 6h-6l-2-6zm-9 3l6 1m12 0l6-1m-20 14l5-7m5 0l5 7"/>',
    star: '<path d="M20 5l4 10 11 1-8 7 2 11-9-6-9 6 2-11-8-7 11-1z"/>',
    crown: '<path d="M7 29l2-18 8 8 3-13 4 13 8-8 2 18z"/><path d="M7 34h27"/>',
    bolt: '<path d="M24 4L9 23h10l-3 14 16-22H22z"/>',
    wings: '<path d="M19 17C12 9 6 8 3 8c2 8 6 14 16 18m2-9c7-8 13-9 16-9-2 8-6 14-16 18"/>',
    flame: '<path d="M21 4c4 9-3 10 2 16 2-5 6-6 7-10 7 10 4 26-10 27C7 36 5 23 12 15c0 6 3 7 4 9-1-8 2-12 5-20z"/>',
    trophy: '<path d="M11 7h18v9c0 8-4 12-9 12s-9-4-9-12zM8 10H4v4c0 6 4 9 9 9m19-13h4v4c0 6-4 9-9 9M20 28v6m-8 2h16"/>',
    tower: '<path d="M8 13l4-7 4 7 4-7 4 7 4-7 4 7v23H8zM15 36V24h10v12"/>',
    anchor: '<path d="M20 5v29M13 11h14M7 24c0 8 5 12 13 12s13-4 13-12M4 27l3-3 4 2m25 1l-3-3-4 2"/>',
    diamond: '<path d="M20 4l15 13-15 20L5 17zM5 17h30M20 4l-7 13 7 20 7-20z"/>',
    laurel: '<path d="M18 35C8 30 5 18 10 8m12 27c10-5 13-17 8-27M9 13l-5-2m5 8l-6 1m9 5l-5 4m24-16l5-2m-5 8l6 1m-9 5l5 4"/>'
  }[id] || '';
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${art}</svg>`;
}

function proCrestPatternSwatch(pattern, design) {
  return `<span class="crest-pattern-swatch crest-pattern-${pattern}" style="--crest-p:${design.primary};--crest-s:${design.secondary}"></span>`;
}

function clubCrestDesignerHTML(name) {
  const design = normalizedClubCrestDesign(clubCrestDesign, name);
  clubCrestDesign = design;
  const shapes = PRO_CREST_SHAPES.map(shape => `<button type="button" class="crest-option crest-shape-option ${design.shape === shape.id ? 'selected' : ''}" data-crest-shape="${shape.id}" aria-pressed="${design.shape === shape.id}" onclick="selectClubCrestShape('${shape.id}')">${proCrestShapeThumb(shape)}<span>${shape.label}</span></button>`).join('');
  const patterns = PRO_CREST_PATTERNS.map(([id, label]) => `<button type="button" class="crest-option crest-pattern-option ${design.pattern === id ? 'selected' : ''}" data-crest-pattern="${id}" aria-pressed="${design.pattern === id}" onclick="selectClubCrestPattern('${id}')">${proCrestPatternSwatch(id, design)}<span>${label}</span></button>`).join('');
  const emblems = PRO_CREST_EMBLEMS.map(([id, label]) => `<button type="button" class="crest-option crest-emblem-option ${design.emblem === id ? 'selected' : ''}" data-crest-emblem="${id}" aria-pressed="${design.emblem === id}" onclick="selectClubCrestEmblem('${id}')">${proCrestEmblemIcon(id)}<span>${label}</span></button>`).join('');
  const palettes = PRO_CREST_PALETTES.map((palette, index) => {
    const selected = palette.colors.every((color, colorIndex) => color.toLowerCase() === [design.primary, design.secondary, design.accent][colorIndex]);
    return `<button type="button" class="crest-palette ${selected ? 'selected' : ''}" data-crest-palette="${index}" title="${escapeHtml(palette.name)}" aria-label="Paleta ${escapeHtml(palette.name)}" aria-pressed="${selected}" onclick="selectClubCrestPalette(${index})">${palette.colors.map(color => `<i style="--swatch:${color}"></i>`).join('')}</button>`;
  }).join('');
  const borders = PRO_CREST_BORDERS.map(([id, label]) => `<button type="button" class="crest-segment ${design.border === id ? 'selected' : ''}" data-crest-border="${id}" aria-pressed="${design.border === id}" onclick="selectClubCrestBorder('${id}')">${label}</button>`).join('');
  const finishes = PRO_CREST_FINISHES.map(([id, label]) => `<button type="button" class="crest-segment ${design.finish === id ? 'selected' : ''}" data-crest-finish="${id}" aria-pressed="${design.finish === id}" onclick="selectClubCrestFinish('${id}')">${label}</button>`).join('');
  return `<div class="crest-studio-shell">
    <header class="crest-studio-header">
      <div><span class="crest-studio-kicker">EL FULBITO · CREST STUDIO</span><h2 id="crest-studio-title">CONSTRUÍ TU IDENTIDAD</h2><p>Combiná cada capa hasta crear un escudo único para el club.</p></div>
      <div class="crest-studio-header-actions"><button type="button" class="btn btn-ghost btn-sm" aria-label="Crear diseño aleatorio" onclick="randomizeClubCrestDesign()">✦ Sorprendeme</button><button type="button" class="crest-studio-close" aria-label="Cerrar diseñador" onclick="toggleClubCrestDesigner(false)">✕</button></div>
    </header>
    <div class="crest-studio-workspace">
      <aside class="crest-studio-stage" aria-label="Vista previa del escudo">
        <div class="crest-stage-light"></div><div class="crest-stage-ring"></div>
        <div class="crest-studio-preview" id="club-crest-designer-preview" aria-live="polite"></div>
        <div class="crest-stage-name">${escapeHtml(name || state.currentClub?.name || 'Mi club')}</div>
        <div class="crest-context-previews"><div><span id="crest-preview-header"></span><small>Cabecera</small></div><div><span id="crest-preview-card"></span><small>Tarjeta</small></div></div>
      </aside>
      <main class="crest-studio-controls">
        <section class="crest-control-section"><div class="crest-control-title"><b>01</b><div><strong>Silueta</strong><span>Elegí la forma base</span></div></div><div class="crest-options-grid crest-shapes-grid">${shapes}</div></section>
        <section class="crest-control-section"><div class="crest-control-title"><b>02</b><div><strong>Diseño</strong><span>Aplicá una trama independiente</span></div></div><div class="crest-options-grid crest-patterns-grid">${patterns}</div></section>
        <section class="crest-control-section"><div class="crest-control-title"><b>03</b><div><strong>Colores del club</strong><span>Paletas curadas o combinación propia</span></div></div><div class="crest-palette-grid">${palettes}</div><div class="crest-color-editor"><label><span>Principal</span><input id="club-crest-primary" type="color" value="${design.primary}" oninput="updateClubCrestDesign()"></label><label><span>Secundario</span><input id="club-crest-secondary" type="color" value="${design.secondary}" oninput="updateClubCrestDesign()"></label><label><span>Acento</span><input id="club-crest-accent" type="color" value="${design.accent}" oninput="updateClubCrestDesign()"></label><button type="button" class="crest-swap-colors" title="Intercambiar colores" onclick="swapClubCrestColors()">⇄</button></div><p class="crest-contrast-note" id="crest-contrast-note"></p></section>
        <section class="crest-control-section"><div class="crest-control-title"><b>04</b><div><strong>Emblema</strong><span>Símbolo central 100% vectorial</span></div></div><div class="crest-options-grid crest-emblems-grid">${emblems}</div><div class="crest-detail-grid"><label><span>Sigla</span><input id="club-crest-initials" maxlength="3" value="${escapeHtml(design.initials)}" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);updateClubCrestDesign()"></label><label><span>Año</span><input id="club-crest-year" inputmode="numeric" maxlength="4" value="${escapeHtml(design.year)}" placeholder="2026" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,4);updateClubCrestDesign()"></label><label class="crest-range-control"><span>Tamaño <output id="crest-scale-output">${design.emblemScale}%</output></span><input id="club-crest-scale" type="range" min="72" max="128" value="${design.emblemScale}" oninput="updateClubCrestDesign()"></label><label class="crest-range-control"><span>Altura</span><input id="club-crest-y" type="range" min="-38" max="38" value="${design.emblemY}" oninput="updateClubCrestDesign()"></label><label class="crest-toggle"><input id="club-crest-plate" type="checkbox" ${design.plate ? 'checked' : ''} onchange="updateClubCrestDesign()"><span>Placa detrás</span></label><label class="crest-stars-control"><span>Estrellas</span><select id="club-crest-stars" onchange="updateClubCrestDesign()"><option value="0" ${design.stars === 0 ? 'selected' : ''}>Ninguna</option><option value="1" ${design.stars === 1 ? 'selected' : ''}>1 estrella</option><option value="2" ${design.stars === 2 ? 'selected' : ''}>2 estrellas</option><option value="3" ${design.stars === 3 ? 'selected' : ''}>3 estrellas</option></select></label></div></section>
        <section class="crest-control-section crest-finish-section"><div><div class="crest-control-title"><b>05</b><div><strong>Borde</strong><span>Terminación exterior</span></div></div><div class="crest-segmented">${borders}</div></div><div><div class="crest-control-title crest-control-title-compact"><div><strong>Acabado</strong><span>Textura final</span></div></div><div class="crest-segmented">${finishes}</div></div></section>
      </main>
    </div>
    <footer class="crest-studio-footer"><div class="crest-history-actions"><button type="button" class="btn btn-ghost btn-sm" id="crest-undo" aria-label="Deshacer" onclick="undoClubCrestDesign()">↶ Deshacer</button><button type="button" class="btn btn-ghost btn-sm" id="crest-redo" aria-label="Rehacer" onclick="redoClubCrestDesign()">↷ Rehacer</button><button type="button" class="btn btn-ghost btn-sm" aria-label="Reiniciar diseño" onclick="resetClubCrestDesign()">Reiniciar</button></div><div><span>Se guarda para todo el club</span><button type="button" class="btn btn-primary" id="crest-apply-button" onclick="applyClubCrestDesign()">🛡️ Aplicar escudo</button></div></footer>
  </div>`;
}

function toggleClubCrestDesigner(forceOpen) {
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !clubCrestDesignerOpen;
  clubCrestDesignerOpen = shouldOpen;
  if (!shouldOpen) {
    closeModal('modal-crest-designer');
    deactivateProCrestModal();
    return;
  }
  const name = clubBrandDraftName || document.getElementById('club-brand-name')?.value || state.currentClub?.name || 'Mi club';
  const savedDesign = clubBrandDraftDesign === undefined ? state.currentClub?.crestDesign : clubBrandDraftDesign;
  clubCrestDesign = normalizedClubCrestDesign(savedDesign || clubCrestDesign, name);
  proCrestHistory = [JSON.stringify(clubCrestDesign)];
  proCrestHistoryIndex = 0;
  const target = document.getElementById('modal-crest-designer-content');
  if (!target) return;
  target.innerHTML = clubCrestDesignerHTML(name);
  openModal('modal-crest-designer');
  renderClubCrestDesign(false);
  activateProCrestModal();
}

function readClubCrestDesignInputs() {
  const fallbackName = clubBrandDraftName || state.currentClub?.name || 'FC';
  const current = normalizedClubCrestDesign(clubCrestDesign, fallbackName);
  return normalizedClubCrestDesign({
    ...current,
    primary: document.getElementById('club-crest-primary')?.value || current.primary,
    secondary: document.getElementById('club-crest-secondary')?.value || current.secondary,
    accent: document.getElementById('club-crest-accent')?.value || current.accent,
    initials: document.getElementById('club-crest-initials')?.value || current.initials,
    year: document.getElementById('club-crest-year')?.value || '',
    stars: document.getElementById('club-crest-stars')?.value ?? current.stars,
    emblemScale: document.getElementById('club-crest-scale')?.value || current.emblemScale,
    emblemY: document.getElementById('club-crest-y')?.value ?? current.emblemY,
    plate: document.getElementById('club-crest-plate')?.checked ?? current.plate
  }, fallbackName);
}

function rememberClubCrestDesign() {
  const serialized = JSON.stringify(clubCrestDesign);
  if (proCrestHistory[proCrestHistoryIndex] === serialized) return;
  proCrestHistory = proCrestHistory.slice(0, proCrestHistoryIndex + 1);
  proCrestHistory.push(serialized);
  if (proCrestHistory.length > 30) proCrestHistory.shift();
  proCrestHistoryIndex = proCrestHistory.length - 1;
}

function updateClubCrestDesign() {
  clubCrestDesign = readClubCrestDesignInputs();
  rememberClubCrestDesign();
  renderClubCrestDesign(false);
}

function setClubCrestDesign(next, remember = true) {
  clubCrestDesign = normalizedClubCrestDesign(next, clubBrandDraftName || state.currentClub?.name || 'FC');
  if (remember) rememberClubCrestDesign();
  syncClubCrestDesignControls();
  renderClubCrestDesign(false);
}

function syncClubCrestDesignControls() {
  const values = { 'club-crest-primary': clubCrestDesign.primary, 'club-crest-secondary': clubCrestDesign.secondary, 'club-crest-accent': clubCrestDesign.accent, 'club-crest-initials': clubCrestDesign.initials, 'club-crest-year': clubCrestDesign.year, 'club-crest-scale': clubCrestDesign.emblemScale, 'club-crest-y': clubCrestDesign.emblemY, 'club-crest-stars': clubCrestDesign.stars };
  Object.entries(values).forEach(([id, value]) => { const input = document.getElementById(id); if (input) input.value = value; });
  const plate = document.getElementById('club-crest-plate');
  if (plate) plate.checked = clubCrestDesign.plate;
}

function selectClubCrestShape(shape) { setClubCrestDesign({ ...readClubCrestDesignInputs(), shape }); }
function selectClubCrestPattern(pattern) { setClubCrestDesign({ ...readClubCrestDesignInputs(), pattern }); }
function selectClubCrestEmblem(emblem) { setClubCrestDesign({ ...readClubCrestDesignInputs(), emblem }); }
function selectClubCrestBorder(border) { setClubCrestDesign({ ...readClubCrestDesignInputs(), border }); }
function selectClubCrestFinish(finish) { setClubCrestDesign({ ...readClubCrestDesignInputs(), finish }); }

function selectClubCrestPalette(index) {
  const palette = PRO_CREST_PALETTES[index];
  if (!palette) return;
  setClubCrestDesign({ ...readClubCrestDesignInputs(), primary: palette.colors[0], secondary: palette.colors[1], accent: palette.colors[2] });
}

function swapClubCrestColors() {
  const current = readClubCrestDesignInputs();
  setClubCrestDesign({ ...current, primary: current.secondary, secondary: current.primary });
}

function randomizeClubCrestDesign() {
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const palette = pick(PRO_CREST_PALETTES);
  const current = readClubCrestDesignInputs();
  setClubCrestDesign({ ...current, shape: pick(PRO_CREST_SHAPES).id, pattern: pick(PRO_CREST_PATTERNS)[0], emblem: pick(PRO_CREST_EMBLEMS)[0], border: pick(PRO_CREST_BORDERS)[0], finish: pick(PRO_CREST_FINISHES)[0], primary: palette.colors[0], secondary: palette.colors[1], accent: palette.colors[2], stars: Math.floor(Math.random() * 4), emblemScale: 88 + Math.floor(Math.random() * 29), emblemY: -12 + Math.floor(Math.random() * 25) });
}

function undoClubCrestDesign() {
  if (proCrestHistoryIndex <= 0) return;
  proCrestHistoryIndex--;
  setClubCrestDesign(JSON.parse(proCrestHistory[proCrestHistoryIndex]), false);
}

function redoClubCrestDesign() {
  if (proCrestHistoryIndex >= proCrestHistory.length - 1) return;
  proCrestHistoryIndex++;
  setClubCrestDesign(JSON.parse(proCrestHistory[proCrestHistoryIndex]), false);
}

function resetClubCrestDesign() {
  setClubCrestDesign(defaultClubCrestDesign(clubBrandDraftName || state.currentClub?.name || 'FC'));
}

function proCrestRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function proCrestColorDistance(a, b) {
  const first = proCrestRgb(a);
  const second = proCrestRgb(b);
  return Math.sqrt(first.reduce((total, value, index) => total + Math.pow(value - second[index], 2), 0));
}

function proCrestShade(hex, amount) {
  const rgb = proCrestRgb(hex).map(value => Math.max(0, Math.min(255, value + amount)));
  return `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function renderClubCrestDesign() {
  const preview = document.getElementById('club-crest-designer-preview');
  const headerPreview = document.getElementById('crest-preview-header');
  const cardPreview = document.getElementById('crest-preview-card');
  if (preview) preview.innerHTML = clubCrestDesignSvg(clubCrestDesign, 'main');
  if (headerPreview) headerPreview.innerHTML = clubCrestDesignSvg(clubCrestDesign, 'header');
  if (cardPreview) cardPreview.innerHTML = clubCrestDesignSvg(clubCrestDesign, 'card');
  document.querySelectorAll('[data-crest-shape]').forEach(button => { const selected = button.dataset.crestShape === clubCrestDesign.shape; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  document.querySelectorAll('[data-crest-pattern]').forEach(button => { const selected = button.dataset.crestPattern === clubCrestDesign.pattern; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  document.querySelectorAll('[data-crest-emblem]').forEach(button => { const selected = button.dataset.crestEmblem === clubCrestDesign.emblem; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  document.querySelectorAll('[data-crest-border]').forEach(button => { const selected = button.dataset.crestBorder === clubCrestDesign.border; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  document.querySelectorAll('[data-crest-finish]').forEach(button => { const selected = button.dataset.crestFinish === clubCrestDesign.finish; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  document.querySelectorAll('[data-crest-palette]').forEach(button => {
    const palette = PRO_CREST_PALETTES[Number(button.dataset.crestPalette)];
    const selected = !!palette && palette.colors.every((color, index) => color.toLowerCase() === [clubCrestDesign.primary, clubCrestDesign.secondary, clubCrestDesign.accent][index]);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected);
  });
  document.querySelectorAll('.crest-pattern-swatch').forEach(swatch => { swatch.style.setProperty('--crest-p', clubCrestDesign.primary); swatch.style.setProperty('--crest-s', clubCrestDesign.secondary); });
  const output = document.getElementById('crest-scale-output');
  if (output) output.textContent = `${clubCrestDesign.emblemScale}%`;
  const note = document.getElementById('crest-contrast-note');
  if (note) {
    const lowContrast = proCrestColorDistance(clubCrestDesign.primary, clubCrestDesign.secondary) < 75;
    note.textContent = lowContrast ? '⚠ Los colores son muy parecidos. Separalos un poco para que el escudo se lea mejor.' : '✓ Buena separación de colores para tamaños pequeños.';
    note.classList.toggle('is-warning', lowContrast);
  }
  const undo = document.getElementById('crest-undo');
  const redo = document.getElementById('crest-redo');
  if (undo) undo.disabled = proCrestHistoryIndex <= 0;
  if (redo) redo.disabled = proCrestHistoryIndex >= proCrestHistory.length - 1;
}

function proCrestPatternArtwork(design) {
  const p = design.primary;
  const s = design.secondary;
  const patterns = {
    solid: `<rect width="360" height="440" fill="${p}"/>`,
    center: `<rect width="360" height="440" fill="${p}"/><rect x="130" width="100" height="440" fill="${s}"/>`,
    stripes: `<rect width="360" height="440" fill="${p}"/><path d="M36 0H84V440H36ZM132 0H180V440H132ZM228 0H276V440H228ZM324 0H372V440H324Z" fill="${s}"/>`,
    pinstripes: `<rect width="360" height="440" fill="${p}"/><path d="M42 0H58V440H42ZM100 0H116V440H100ZM158 0H174V440H158ZM216 0H232V440H216ZM274 0H290V440H274ZM332 0H348V440H332Z" fill="${s}"/>`,
    split: `<rect width="180" height="440" fill="${p}"/><rect x="180" width="180" height="440" fill="${s}"/>`,
    quarters: `<path d="M0 0H180V220H0ZM180 220H360V440H180Z" fill="${p}"/><path d="M180 0H360V220H180ZM0 220H180V440H0Z" fill="${s}"/>`,
    diagonal: `<rect width="360" height="440" fill="${p}"/><path d="M-80 330L260 -20H440L30 440H-80Z" fill="${s}"/>`,
    sash: `<rect width="360" height="440" fill="${p}"/><path d="M-50 80L20 0L410 360L340 440Z" fill="${s}"/>`,
    chevron: `<rect width="360" height="440" fill="${p}"/><path d="M0 0H360V86L180 255L0 86Z" fill="${s}"/>`,
    hoops: `<rect width="360" height="440" fill="${p}"/><path d="M0 58H360V112H0ZM0 178H360V232H0ZM0 298H360V352H0Z" fill="${s}"/>`,
    horizon: `<rect width="360" height="220" fill="${p}"/><rect y="220" width="360" height="220" fill="${s}"/>`,
    rays: `<rect width="360" height="440" fill="${p}"/><path d="M180 220L-40 32L75 -20ZM180 220L132 -20H228ZM180 220L285 -20L400 32ZM180 220L400 342L360 440ZM180 220L228 460H132ZM180 220L0 440L-40 342Z" fill="${s}"/>`
  };
  return patterns[design.pattern] || patterns.solid;
}

function proCrestEmblemArtwork(design) {
  const c = design.accent;
  const p = design.primary;
  const s = design.secondary;
  const art = {
    monogram: `<text x="180" y="246" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="108" font-weight="900" letter-spacing="-8" fill="${c}" stroke="rgba(0,0,0,.22)" stroke-width="3">${escapeHtml(design.initials)}</text>`,
    ball: `<circle cx="180" cy="210" r="73" fill="${c}"/><path d="M180 157l29 21-11 35h-36l-11-35zm-53 13l35 8m71 0l35-8m-116 90l30-47m26 0l30 47m-129-1l18 1m116-1l-18 1" fill="none" stroke="${p}" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>`,
    star: `<path d="M180 104L207 170L278 176L224 221L241 290L180 253L119 290L136 221L82 176L153 170Z" fill="${c}" stroke="${s}" stroke-width="6"/>`,
    crown: `<path d="M91 275L105 145L156 198L180 112L207 198L255 145L269 275Z" fill="${c}" stroke="${s}" stroke-width="7"/><path d="M91 294H269" stroke="${c}" stroke-width="24"/>`,
    bolt: `<path d="M205 91L103 239H166L141 332L257 171H190Z" fill="${c}" stroke="${s}" stroke-width="6"/>`,
    wings: `<path d="M174 181Q113 106 44 122Q72 206 161 252M186 181Q247 106 316 122Q288 206 199 252" fill="${c}" stroke="${s}" stroke-width="7"/><path d="M180 156V287" stroke="${c}" stroke-width="18"/>`,
    flame: `<path d="M186 82Q240 156 194 202Q212 153 166 120Q168 177 133 217Q104 252 128 300Q151 342 203 326Q274 304 248 222Q237 257 210 272Q230 210 186 173Q201 129 186 82Z" fill="${c}" stroke="${s}" stroke-width="7"/>`,
    trophy: `<path d="M125 118H235V188Q235 263 180 263Q125 263 125 188Z" fill="${c}" stroke="${s}" stroke-width="7"/><path d="M123 137H83V165Q83 218 137 226M237 137H277V165Q277 218 223 226M180 263V312M137 315H223" fill="none" stroke="${c}" stroke-width="17" stroke-linecap="round"/>`,
    tower: `<path d="M94 140L116 101L138 140L160 101L182 140L204 101L226 140L248 101L266 140V310H94Z" fill="${c}" stroke="${s}" stroke-width="7"/><path d="M150 310V231H210V310" fill="${p}"/>`,
    anchor: `<path d="M180 92V306M135 132H225M91 225Q91 310 180 310Q269 310 269 225M71 245L91 225L116 240M289 245L269 225L244 240" fill="none" stroke="${c}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><circle cx="180" cy="91" r="24" fill="none" stroke="${c}" stroke-width="13"/>`,
    diamond: `<path d="M180 91L274 176L180 325L86 176Z" fill="${c}" stroke="${s}" stroke-width="7"/><path d="M86 176H274M180 91L137 176L180 325L223 176Z" fill="none" stroke="${p}" stroke-width="10"/>`,
    laurel: `<path d="M166 315Q79 279 92 146M194 315Q281 279 268 146M98 172L59 151M96 216L54 220M112 258L78 291M262 172L301 151M264 216L306 220M248 258L282 291" fill="none" stroke="${c}" stroke-width="15" stroke-linecap="round"/><text x="180" y="246" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="76" font-weight="900" fill="${c}">${escapeHtml(design.initials)}</text>`
  };
  return art[design.emblem] || art.monogram;
}

function clubCrestDesignSvg(rawDesign, instanceId = 'export') {
  const design = normalizedClubCrestDesign(rawDesign, state.currentClub?.name || 'FC');
  const shape = proCrestShape(design.shape);
  const safeInstance = String(instanceId).replace(/[^A-Za-z0-9_-]/g, '') || 'crest';
  const ids = {
    shape: `crestProShape-${safeInstance}`,
    metal: `crestMetal-${safeInstance}`,
    vignette: `crestVignette-${safeInstance}`,
    carbon: `crestCarbon-${safeInstance}`,
    shadow: `crestProShadow-${safeInstance}`,
    glow: `crestProGlow-${safeInstance}`
  };
  const borderColor = design.border === 'champion' ? '#f7cc5b' : design.border === 'silver' ? '#dce9f2' : design.border === 'neon' ? '#72e9ff' : design.accent;
  const outerWidth = design.border === 'clean' ? 10 : design.border === 'neon' ? 15 : 18;
  const innerBorder = design.border === 'double' || design.border === 'champion' || design.border === 'silver';
  const stars = Array.from({ length: design.stars }, (_, index) => {
    const x = 180 + (index - (design.stars - 1) / 2) * 47;
    return `<path d="M${x} 8l8 18 20 2-15 13 5 20-18-11-18 11 5-20-15-13 20-2z" fill="${borderColor}" stroke="rgba(0,0,0,.35)" stroke-width="2"/>`;
  }).join('');
  const plate = design.plate ? `<circle cx="180" cy="214" r="103" fill="rgba(5,12,24,.28)" stroke="${design.accent}" stroke-opacity=".48" stroke-width="5"/><circle cx="180" cy="214" r="92" fill="none" stroke="rgba(255,255,255,.17)" stroke-width="2"/>` : '';
  const finish = design.finish === 'metal'
    ? `<rect width="360" height="440" fill="url(#${ids.metal})" opacity=".42"/><path d="M-30 340L300 -10H390L35 440Z" fill="white" opacity=".055"/>`
    : design.finish === 'carbon'
      ? `<rect width="360" height="440" fill="url(#${ids.carbon})" opacity=".32"/><rect width="360" height="440" fill="url(#${ids.vignette})" opacity=".38"/>`
      : `<rect width="360" height="440" fill="url(#${ids.vignette})" opacity=".18"/>`;
  const emblemScale = design.emblemScale / 100;
  const emblemTransform = `translate(180 ${214 + design.emblemY}) scale(${emblemScale}) translate(-180 -214)`;
  const year = design.year ? `<rect x="126" y="338" width="108" height="34" rx="17" fill="rgba(4,10,18,.62)" stroke="${design.accent}" stroke-opacity=".5"/><text x="180" y="362" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="800" letter-spacing="5" fill="${design.accent}">${design.year}</text>` : '';
  const initialsRibbon = design.emblem === 'monogram' ? '' : `<path d="M109 294H251L239 334H121Z" fill="rgba(5,12,24,.72)" stroke="${design.accent}" stroke-opacity=".55" stroke-width="3"/><text x="180" y="323" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="24" letter-spacing="4" fill="${design.accent}">${escapeHtml(design.initials)}</text>`;
  return `<svg viewBox="0 -42 360 492" role="img" aria-label="Escudo ${escapeHtml(design.initials)}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${ids.shape}"><path d="${shape.path}"/></clipPath><linearGradient id="${ids.metal}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".22" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity=".28"/><stop offset=".82" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient><radialGradient id="${ids.vignette}"><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></radialGradient><pattern id="${ids.carbon}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="12" fill="#fff" opacity=".22"/><rect x="6" width="6" height="12" fill="#000" opacity=".22"/></pattern><filter id="${ids.shadow}" x="-35%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="15" stdDeviation="11" flood-color="#000" flood-opacity=".58"/></filter><filter id="${ids.glow}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${stars}<g filter="url(#${ids.shadow})"><path d="${shape.path}" fill="#09111e" stroke="#06101d" stroke-width="${outerWidth + 9}" stroke-linejoin="round"/><path d="${shape.path}" fill="#09111e" stroke="${borderColor}" stroke-width="${outerWidth}" stroke-linejoin="round" ${design.border === 'neon' ? `filter="url(#${ids.glow})"` : ''}/><g clip-path="url(#${ids.shape})">${proCrestPatternArtwork(design)}${finish}<path d="M35 56Q180 9 325 56" fill="none" stroke="#fff" stroke-opacity=".27" stroke-width="5"/>${plate}<g transform="${emblemTransform}">${proCrestEmblemArtwork(design)}</g>${initialsRibbon}${year}</g>${innerBorder ? `<path d="${shape.path}" fill="none" stroke="rgba(255,255,255,.62)" stroke-width="5" stroke-linejoin="round"/>` : ''}</g></svg>`;
}

async function makeDesignedClubCrest(rawDesign) {
  const svg = clubCrestDesignSvg(rawDesign);
  const sourceUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      const timeout = window.setTimeout(() => reject(new Error('El render tardó demasiado. Intentá nuevamente.')), 6000);
      candidate.onload = () => { window.clearTimeout(timeout); resolve(candidate); };
      candidate.onerror = () => { window.clearTimeout(timeout); reject(new Error('No pudimos renderizar el escudo.')); };
      candidate.src = sourceUrl;
    });
    const sizes = [640, 540, 460, 380];
    for (const width of sizes) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round(width * 492 / 360);
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('Tu dispositivo no pudo preparar la imagen.');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.94, .86, .76]) {
        const encoded = canvas.toDataURL('image/webp', quality);
        if (encoded.startsWith('data:image/webp') && encoded.length <= 245000) return encoded;
      }
    }
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
  throw new Error('El escudo quedó demasiado pesado. Probá un acabado más simple.');
}

async function applyClubCrestDesign() {
  const button = document.getElementById('crest-apply-button');
  clubCrestDesign = readClubCrestDesignInputs();
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Preparando escudo…'; }
  try {
    const encoded = await makeDesignedClubCrest(clubCrestDesign);
    if (!safeClubCrestUrl(encoded)) throw new Error('El escudo no superó la validación final.');
    clubBrandDraftCrest = encoded;
    clubBrandDraftDesign = { ...clubCrestDesign };
    clubCrestDesignerOpen = false;
    closeModal('modal-crest-designer');
    deactivateProCrestModal({ restoreFocus: false });
    renderAdmin();
    saveClubIdentity();
  } catch (error) {
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = '🛡️ Aplicar escudo'; }
    showToast(`❌ ${error.message || 'No pudimos generar el escudo.'}`);
  }
}
