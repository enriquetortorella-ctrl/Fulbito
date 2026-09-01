// PLAYERS TAB
// ============================================================
function setRosterQuery(value) {
  rosterQuery = value || '';
  renderPlayers();
}

function setRosterSort(value) {
  rosterSort = value || 'rating';
  renderPlayers();
}

function rosterEntries() {
  return state.players.map((p, index) => {
    const rec = getPlayerRecord(p.id);
    return {
      p,
      index,
      ovr: getOverall(p) || 60,
      rec,
      ppp: rec.pj ? rec.pts / rec.pj : 0
    };
  });
}

function renderRosterSummary(entries, visible) {
  const count = document.getElementById('players-count');
  const average = document.getElementById('roster-avg-ovr');
  const leader = document.getElementById('roster-leader');
  const visibleCount = document.getElementById('roster-visible-count');
  if (count) count.textContent = entries.length;
  if (average) average.textContent = entries.length ? Math.round(entries.reduce((sum, x) => sum + x.ovr, 0) / entries.length) : '—';
  if (leader) {
    const top = entries.slice().sort((a,b) => b.ovr-a.ovr || a.p.name.localeCompare(b.p.name))[0];
    leader.textContent = top ? `${top.p.name} · ${top.ovr}` : '—';
  }
  if (visibleCount) visibleCount.textContent = `${visible.length} de ${entries.length} jugador${entries.length===1?'':'es'}`;
}

function renderPlayers() {
  const grid = document.getElementById('players-grid');
  const entries = rosterEntries();
  const query = rosterQuery.trim().toLocaleLowerCase();
  const visible = entries
    .filter(x => !query || `${x.p.name} ${x.p.username} ${getEffectivePosition(x.p)}`.toLocaleLowerCase().includes(query));

  visible.sort((a,b) => {
    if (rosterSort === 'name') return a.p.name.localeCompare(b.p.name) || a.index-b.index;
    if (rosterSort === 'performance') return b.ppp-a.ppp || b.rec.pj-a.rec.pj || b.ovr-a.ovr;
    if (rosterSort === 'goals') return b.rec.goals-a.rec.goals || b.rec.pj-a.rec.pj || b.ovr-a.ovr;
    return b.ovr-a.ovr || a.p.name.localeCompare(b.p.name);
  });

  renderRosterSummary(entries, visible);
  const sortSelect = document.getElementById('roster-sort');
  if (sortSelect && sortSelect.value !== rosterSort) sortSelect.value = rosterSort;

  if (!entries.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div>No hay jugadores aún</div></div>`;
    return;
  }
  if (!visible.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⌕</div><div>No encontramos a "${rosterQuery}"</div><div style="font-size:12px;margin-top:7px">Probá con otro nombre, usuario o posición.</div></div>`;
    return;
  }
  const highlights = getCardHighlights(entries);
  grid.innerHTML = visible.map(x => renderFifaCard(x.p, highlights)).join('');
  // La autocalificación ("versión propia") ya no se muestra en el plantel:
  // se ve dentro del perfil de cada jugador, comparada contra el voto del grupo.
}

function hasSelfRating(p) {
  return p.ratings?.[p.id] && Object.keys(p.ratings[p.id]).length > 0;
}

function getSelfStats(p) {
  const r = p.ratings?.[p.id] || {};
  const stats = {};
  STATS.forEach(s => { stats[s] = r[s] || 0; });
  return stats;
}

function getSelfOverall(p) {
  const stats = getSelfStats(p);
  const vals = STATS.map(s => stats[s]).filter(v => v > 0);
  if (!vals.length) return null;
  const pos = p.posPrimary || 'MED';
  let ovr;
  if (pos==='POR') ovr = stats.atajadas*0.4 + stats.ritmo*0.15 + stats.fisico*0.25 + stats.pase*0.1 + stats.defensa*0.1;
  else if (pos==='DEF') ovr = stats.defensa*0.35 + stats.fisico*0.2 + stats.ritmo*0.2 + stats.pase*0.15 + stats.tiro*0.1;
  else if (pos==='MED') ovr = stats.pase*0.35 + stats.ritmo*0.2 + stats.defensa*0.15 + stats.tiro*0.15 + stats.fisico*0.15;
  else ovr = stats.tiro*0.4 + stats.ritmo*0.25 + stats.pase*0.15 + stats.fisico*0.15 + stats.defensa*0.05;
  return Math.round(50 + (ovr-1)/4 * 49);
}

function cardStatsHTML(stats) {
  const pairs = [
    ['RIT', statToFifa(stats.ritmo)],
    ['TIR', statToFifa(stats.tiro)],
    ['PAS', statToFifa(stats.pase)],
    ['DEF', statToFifa(stats.defensa)],
    ['FIS', statToFifa(stats.fisico)],
    ['ATA', statToFifa(stats.atajadas)],
  ];
  const max = Math.max(...pairs.map(([,v]) => v));
  return pairs.map(([k,v]) =>
    `<div class="fifa-card-stat${v===max && v>40 ? ' best' : ''}"><span>${v}</span><span>${k}</span></div>`
  ).join('');
}

function getCardHighlights(entries) {
  const rankedByGoals = entries.filter(x => x.rec.goals > 0);
  const maxGoals = rankedByGoals.length ? Math.max(...rankedByGoals.map(x => x.rec.goals)) : 0;
  const topScorerIds = new Set(rankedByGoals.filter(x => x.rec.goals === maxGoals).map(x => x.p.id));
  const latestMvpMatch = matches
    .filter(m => isPlayed(m) && m.result?.mvp)
    .slice()
    .sort((a,b) => `${b.match_date||''}|${b.created_at||''}`.localeCompare(`${a.match_date||''}|${a.created_at||''}`))[0];
  return {
    topScorerIds,
    latestMvpId: latestMvpMatch?.result?.mvp || null,
    forms: new Map(entries.map(x => [x.p.id, getPlayerForm(x.p.id)]))
  };
}

function cardSpotlightsHTML(p, highlights) {
  const form = highlights.forms.get(p.id);
  const badges = [];
  if (form?.type === 'V' && form.streak >= 2) badges.push(`<span class="card-spotlight is-hot">🔥 ${form.streak}V</span>`);
  if (highlights.topScorerIds.has(p.id)) badges.push('<span class="card-spotlight is-scorer">⚽ GOLEADOR</span>');
  if (highlights.latestMvpId === p.id) badges.push('<span class="card-spotlight is-mvp">⭐ ÚLTIMO MVP</span>');
  return badges.length ? `<div class="card-spotlights">${badges.join('')}</div>` : '';
}

function renderFifaCard(p, highlights) {
  const ovr = getOverall(p) || 60;
  const tier = getCardTier(ovr);
  const pos = getEffectivePosition(p);
  const stats = getAvgStats(p) || {};
  const photoUrl = safePhotoUrl(p.photo);
  const portrait = photoUrl
    ? `<div class="fifa-card-portrait"><img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(p.name)}"></div>`
    : `<div class="fifa-card-portrait is-placeholder" aria-hidden="true">⚽</div>`;

  const rec = getPlayerRecord(p.id);
  // MVPs y goles salen de la franja: van en medallas propias, que entran
  // donde el escudo tiene lugar. La franja queda solo con el récord.
  const medals = [
    rec.mvps > 0 ? `<span class="fifa-medal is-mvp" title="${rec.mvps} MVP"><i>★</i><b>${rec.mvps}</b></span>` : '',
    rec.goals > 0 ? `<span class="fifa-medal is-goal" title="${rec.goals} goles"><i>⚽</i><b>${rec.goals}</b></span>` : '',
  ].filter(Boolean).join('');
  const medalsHTML = medals ? `<div class="fifa-card-medals">${medals}</div>` : '';
  const recHTML = rec.pj > 0
    ? `<div class="fifa-card-record">${rec.w}V · ${rec.d}E · ${rec.l}D</div>`
    : '';
  const form = highlights.forms.get(p.id);
  const isHot = form?.type === 'V' && form.streak >= 2;
  const isTopScorer = highlights.topScorerIds.has(p.id);
  const isLatestMvp = highlights.latestMvpId === p.id;
  const spotlights = cardSpotlightsHTML(p, highlights);
  const cardClasses = [tier.cls, isHot ? 'card-hot' : '', isTopScorer ? 'card-top-scorer' : '', isLatestMvp ? 'card-mvp' : '', spotlights ? 'has-card-spotlight' : ''].filter(Boolean).join(' ');
  // La etiqueta bajo la posición explica el marco. Mismo orden de prioridad
  // que los fondos en cards.css: racha < goleador < MVP.
  const frameLabel = isLatestMvp ? 'MVP'
    : isTopScorer ? 'GOLEADOR'
    : isHot ? `RACHA ${form.streak}V`
    : tier.label;

  return `<div class="fifa-card ${cardClasses}" onclick="openPlayerProfile('${p.id}')">
    <span class="fifa-shine"></span>
    ${portrait}
    <div class="fifa-top">
      <div class="fifa-left">
        <div class="fifa-card-overall">${ovr}</div>
        <div class="fifa-card-pos">${pos}</div>
        <div class="fifa-card-tier">${frameLabel}</div>
      </div>
      <div class="fifa-meta">${recHTML}${medalsHTML}</div>
    </div>
    <div class="fifa-divider"></div>
    <div class="fifa-card-name">${escapeHtml(p.username.toUpperCase())}</div>
    <div class="fifa-card-stats">${cardStatsHTML(stats)}</div>
    ${spotlights}
  </div>`;
}

function openPlayerProfile(id) {
  const p = state.players.find(x=>x.id===id);
  if (!p) return;
  closeModal('modal-profile');
  const ovr = getOverall(p) || 60;
  const tier = getCardTier(ovr);
  const pos = getEffectivePosition(p);
  const stats = getAvgStats(p) || {};
  const profilePhotoUrl = safePhotoUrl(p.photo);
  const photo = profilePhotoUrl ? `<img src="${escapeHtml(profilePhotoUrl)}" alt="" style="width:100px;height:100px;border-radius:10px;object-fit:cover;border:2px solid var(--gold);display:block;margin:0 auto 12px">` : `<div style="font-size:64px;text-align:center;margin-bottom:12px">👤</div>`;

  const statBars = STATS.map(s => {
    const fifa = statToFifa(stats[s]||0);
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="color:var(--muted)">${STAT_LABELS[s]}</span>
        <span style="font-family:'Bebas Neue',sans-serif;font-size:16px">${fifa}</span>
      </div>
      <div style="height:4px;background:var(--bg3);border-radius:2px">
        <div style="height:4px;border-radius:2px;width:${fifa}%;background:${fifa>=75?'var(--gold)':fifa>=60?'var(--green)':'var(--muted)'}"></div>
      </div>
    </div>`;
  }).join('');

  const validVoters = getValidRatings(p).length;
  const hasSelf = hasSelfRating(p);
  const trimmedNote = validVoters >= 4 ? ' · extremos filtrados por atributo' : '';

  const rec = getPlayerRecord(p.id);
  const form = getPlayerForm(p.id);
  const formDots = form.last5.length
    ? `<span style="display:inline-flex;gap:3px;margin-left:6px;vertical-align:middle">${form.last5.map(x=>`<span class="form-dot ${x==='V'?'fd-v':x==='E'?'fd-e':'fd-d'}">${x}</span>`).join('')}</span>`
    : '';
  const recChip = rec.pj > 0
    ? `<span class="chip" style="margin-top:8px;color:var(--gold);border-color:rgba(240,192,64,.4)">🏆 ${rec.pj} PJ · ${rec.w}V ${rec.d}E ${rec.l}D · ${rec.pts} pts${rec.mvps>0?` · ⭐${rec.mvps} MVP`:''}</span>${formDots}`
    : '';
  const goalChip = rec.goals > 0
    ? `<span class="chip" style="margin-top:8px;color:var(--green);border-color:rgba(34,197,94,.4)">⚽ ${rec.goals} gol${rec.goals===1?'':'es'}${rec.goalPj?` · ${(rec.goals/rec.goalPj).toFixed(1)} por partido desde registro`:''}</span>`
    : '';

  let selfSection = '';
  if (hasSelf) {
    const selfOvr = getSelfOverall(p);
    const selfStats = getSelfStats(p);
    const selfBars = STATS.map(s => {
      const groupFifa = statToFifa(stats[s]||0);
      const selfFifa = statToFifa(selfStats[s]||0);
      const diff = selfFifa - groupFifa;
      const diffColor = Math.abs(diff) < 5 ? 'var(--muted)' : diff > 0 ? 'var(--gold)' : '#60a5fa';
      return `<div style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">
          <span style="color:var(--muted)">${STAT_LABELS[s]}</span>
          <span style="color:${diffColor};font-family:'Bebas Neue',sans-serif;font-size:14px">
            ${selfFifa} <span style="color:var(--muted);font-size:10px">(grupo: ${groupFifa})</span>
          </span>
        </div>
        <div style="height:3px;background:var(--bg3);border-radius:2px;position:relative">
          <div style="height:3px;border-radius:2px;width:${selfFifa}%;background:#14b8a6"></div>
        </div>
      </div>`;
    }).join('');

    selfSection = `
      <div style="margin-top:20px;padding:14px;background:rgba(20,184,166,.08);border:1px solid rgba(20,184,166,.3);border-radius:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="font-size:18px">⭐</span>
          <span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:#14b8a6">Autocalificación</span>
          <span style="margin-left:auto;font-family:'Bebas Neue',sans-serif;font-size:24px;color:#14b8a6">${selfOvr}</span>
        </div>
        <p style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.4">Cómo se ve ${p.username} a sí mismo. No afecta el overall del grupo.</p>
        ${selfBars}
      </div>`;
  }

  // Sociedades y rivalidades del jugador
  let socHTML = '';
  if (rec.pj > 0) {
    const { together, against } = getPairStats();
    const socRows = [];

    const mates = Object.entries(together)
      .filter(([key]) => key.split('|').includes(p.id))
      .map(([key, v]) => {
        const other = key.split('|').find(x => x !== p.id);
        const pj = v.w + v.d + v.l;
        return { other, ...v, pj, wr: pj ? v.w/pj : 0 };
      })
      .filter(x => x.pj >= 2);
    if (mates.length) {
      const best = mates.slice().sort((a,b)=>b.wr-a.wr||b.pj-a.pj)[0];
      socRows.push(['🤝','Mejor socio', `${playerNameById(best.other)} — ${best.w}V ${best.d}E ${best.l}D juntos (${Math.round(best.wr*100)}%)`]);
      const worst = mates.slice().sort((a,b)=>a.wr-b.wr||b.pj-a.pj)[0];
      if (worst && worst.other !== best.other) {
        socRows.push(['🧊','Peor socio', `${playerNameById(worst.other)} — ${worst.w}V ${worst.d}E ${worst.l}D juntos (${Math.round(worst.wr*100)}%)`]);
      }
      const most = mates.slice().sort((a,b)=>b.pj-a.pj)[0];
      socRows.push(['👯','Con quien más jugó', `${playerNameById(most.other)} — ${most.pj} partidos juntos`]);
    }

    const rivals = Object.entries(against)
      .filter(([key]) => key.split('|').includes(p.id))
      .map(([key, v]) => {
        const other = key.split('|').find(x => x !== p.id);
        const myW = v.wins[p.id] || 0;
        const theirW = v.wins[other] || 0;
        return { other, myW, theirW, games: v.games };
      })
      .filter(x => x.games >= 2);
    if (rivals.length) {
      const verdugo = rivals.slice().sort((a,b)=>(b.theirW-b.myW)-(a.theirW-a.myW))[0];
      if (verdugo && verdugo.theirW > verdugo.myW) {
        socRows.push(['😈','Su verdugo', `${playerNameById(verdugo.other)} — le ganó ${verdugo.theirW} a ${verdugo.myW}`]);
      }
      const victima = rivals.slice().sort((a,b)=>(b.myW-b.theirW)-(a.myW-a.theirW))[0];
      if (victima && victima.myW > victima.theirW) {
        socRows.push(['🎯','Su víctima', `${playerNameById(victima.other)} — le gana ${victima.myW} a ${victima.theirW}`]);
      }
    }

    // Paternidades
    const paters = getPaternidades(matches);
    const papa = paters.find(x => x.hijo === p.id);
    if (papa) socRows.push([babySVG(22), 'Su papá', `${playerNameById(papa.padre)} le gana ${papa.pw} a ${papa.hw} 🍼`]);
    const hijos = paters.filter(x => x.padre === p.id);
    if (hijos.length) {
      socRows.push(['👨\u200d👦', `Sus hijos (${hijos.length})`, hijos.slice(0,3).map(h => `${playerNameById(h.hijo)} (${h.pw}-${h.hw})`).join(', ')]);
    }

    const maxV = getMaxWinStreak(p.id);
    if (maxV >= 2) socRows.push(['🔥','Mejor racha', `${maxV} victorias seguidas`]);

    if (socRows.length) {
      socHTML = `<div style="margin-top:16px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:10px">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">⚽ Sociedades</div>
        ${socRows.map(([emoji, label, val]) => `
          <div style="display:flex;gap:10px;align-items:center;padding:5px 0">
            <span style="font-size:18px">${emoji}</span>
            <div>
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${label}</div>
              <div style="font-size:12.5px;font-weight:600">${val}</div>
            </div>
          </div>`).join('')}
      </div>`;
    }
  }

  document.getElementById('modal-profile-title').textContent = p.name.toUpperCase();
  document.getElementById('modal-profile-content').innerHTML = `
      ${photo}
    <div style="text-align:center;margin-bottom:16px">
      <span style="font-family:'Bebas Neue',sans-serif;font-size:48px">${ovr}</span>
      <span style="display:block;color:var(--muted);font-size:13px">${tier.label} · ${pos} · ${validVoters} voto${validVoters===1?'':'s'}${trimmedNote}</span>
      <span style="display:block;color:var(--muted);font-size:12px;margin-top:4px">Posición secundaria: ${p.posSecondary||'-'}</span>
      ${recChip}
      ${goalChip}
    </div>
    <div>${statBars}</div>
    ${socHTML}
    ${selfSection}
  `;
  openModal('modal-profile');
}

// ============================================================
// EDIT MY PROFILE
// ============================================================
let editPhotoData = null;

function openEditProfile() {
  if (state.currentUser?.supportMode) { showToast('🛡️ Salí del modo soporte para editar tu perfil.'); return; }
  const me = getMe();
  if (!me) return;
  editPhotoData = me.photo;

  const photoHTML = me.photo
    ? `<img src="${escapeHtml(safePhotoUrl(me.photo))}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : '📷';

  document.getElementById('modal-edit-content').innerHTML = `
    <div class="photo-upload">
      <div class="photo-preview" id="edit-photo-preview" onclick="document.getElementById('edit-photo-input').click()" style="width:80px;height:80px;border-radius:50%;border:2px solid var(--gold);background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:36px;cursor:pointer;overflow:hidden">${photoHTML}</div>
      <span class="text-muted">Cambiar foto</span>
      <input type="file" id="edit-photo-input" accept="image/*" class="hidden" onchange="handleEditPhoto(this)">
    </div>
    <div class="form-group">
      <label>Nombre</label>
      <input type="text" id="edit-name" value="${me.name}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:15px;outline:none">
    </div>
    <div class="form-group">
      <label>Usuario</label>
      <input type="text" id="edit-username" value="${me.username}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:15px;outline:none">
    </div>
    <div class="form-group">
      <label>Posición principal</label>
      <div class="pos-grid" id="edit-pos-primary">
        ${POSITIONS.map(pos=>`<div class="pos-btn${me.posPrimary===pos?' selected':''}" data-pos="${pos}" onclick="selectEditPos('primary',this)">${posEmoji(pos)} ${pos}</div>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label>Posición secundaria</label>
      <div class="pos-grid" id="edit-pos-secondary">
        ${POSITIONS.map(pos=>`<div class="pos-btn${me.posSecondary===pos?' selected':''}" data-pos="${pos}" onclick="selectEditPos('secondary',this)">${posEmoji(pos)} ${pos}</div>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label>Contraseña actual</label>
      <input type="password" id="edit-pass-current" placeholder="••••••" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:15px;outline:none">
    </div>
    <div class="form-group">
      <label>Nueva contraseña (dejá vacío para no cambiar)</label>
      <input type="password" id="edit-pass" placeholder="••••••" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:15px;outline:none">
    </div>
    <div id="edit-profile-error" style="color:var(--red);font-size:13px;display:none;margin-bottom:8px"></div>
    <button class="btn btn-primary w-full" style="justify-content:center;margin-top:8px" onclick="saveEditProfile()">💾 Guardar</button>
  `;
  openModal('modal-edit-profile');
}

let editPosPrimary = null, editPosSecondary = null;
function selectEditPos(type, el) {
  el.closest('.pos-grid').querySelectorAll('.pos-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  if(type==='primary') editPosPrimary = el.dataset.pos;
  else editPosSecondary = el.dataset.pos;
}
function handleEditPhoto(input) {
  const file = input.files[0]; if(!file) return;
  const r = new FileReader();
  r.onload = e => {
    compressPhoto(e.target.result, compressed => {
      editPhotoData = compressed;
      document.getElementById('edit-photo-preview').innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    });
  };
  r.readAsDataURL(file);
}
async function saveEditProfile() {
  const me = getMe(); if(!me) return;
  const nameEl = document.getElementById('edit-name');
  const userEl = document.getElementById('edit-username');
  const passCurrentEl = document.getElementById('edit-pass-current');
  const passEl = document.getElementById('edit-pass');
  const primarySel = document.querySelector('#edit-pos-primary .pos-btn.selected');
  const secondarySel = document.querySelector('#edit-pos-secondary .pos-btn.selected');
  const errEl = document.getElementById('edit-profile-error');
  errEl.style.display = 'none';

  const newUser = userEl ? userEl.value.trim().toLowerCase() : me.username;
  const newPass = passEl.value;
  const currentPass = passCurrentEl ? passCurrentEl.value : '';

  try {
    const data = await callRpc('fulbito_update_my_profile', {
      p_club_id: state.currentClub.id,
      p_name: nameEl.value.trim() || me.name,
      p_username: newUser || me.username,
      p_pos_primary: primarySel?.dataset.pos || me.posPrimary,
      p_pos_secondary: secondarySel?.dataset.pos || me.posSecondary,
      p_photo: editPhotoData || null,
      p_current_password: currentPass || null,
      p_new_password: newPass || null
    });
    const saved = mapPlayers([data])[0];
    Object.assign(me, saved);
    state.currentUser.name = saved.name;
    state.currentUser.username = saved.username;
    SESSION.set({ ...state.currentUser, clubName: state.currentClub.name, clubCrest: state.currentClub.crest || null, clubInviteCode: state.currentUser.isAdmin ? state.currentClub.inviteCode || null : null });
    closeModal('modal-edit-profile');
    showApp();
    showToast('✅ Perfil actualizado');
  } catch (error) {
    errEl.textContent = error.message || 'No se pudo actualizar el perfil';
    errEl.style.display = 'block';
  }
}

async function requestReset() {
  const user = document.getElementById('forgot-user').value.trim();
  const msgEl = document.getElementById('forgot-msg');
  if (!user) {
    msgEl.textContent='Ingresá tu usuario';
    msgEl.style.background='rgba(239,68,68,.1)'; msgEl.style.color='var(--red)';
    msgEl.style.display='block'; return;
  }
  try {
    await callRpc('fulbito_request_reset', { p_club_id: state.currentClub.id, p_username: user });
    msgEl.innerHTML = `✅ Listo. Si existe esa cuenta, el pedido fue enviado al admin.<br><strong style="color:var(--gold)">Cuando lo resetee, entrá con la clave 1234.</strong>`;
    msgEl.style.background='rgba(34,197,94,.1)'; msgEl.style.color='var(--green)';
    msgEl.style.display='block';
  } catch (error) {
    msgEl.textContent = error.message || 'No se pudo enviar el pedido.';
    msgEl.style.background='rgba(239,68,68,.1)'; msgEl.style.color='var(--red)';
    msgEl.style.display='block';
  }
}

async function toggleAdmin(id) {
  const p = state.players.find(x=>x.id===id);
  if (!p) return;
  try {
    const data = await callRpc('fulbito_set_admin', { p_club_id: state.currentClub.id, p_player_id: id, p_is_admin: !p.isAdmin });
    Object.assign(p, mapPlayers([data])[0]);
    renderAdmin();
    showToast(p.isAdmin ? `👑 ${p.username} es admin` : `${p.username} ya no es admin`);
  } catch (error) { showToast(`❌ ${error.message}`); }
}

async function adminResetPassword(id) {
  const p = state.players.find(x=>x.id===id);
  if (!p) return;
  if (!await confirmAppAction({ title: 'RESETEAR CONTRASEÑA', message: `La contraseña de ${p.name} (@${p.username}) pasará a ser 1234.`, confirmText: 'Resetear contraseña', danger: true })) return;
  try {
    await callRpc('fulbito_admin_reset_player', { p_club_id: state.currentClub.id, p_player_id: id });
    p._resetRequested = false;
    renderAdmin();
    showToast(`🔑 Contraseña de ${p.username} reseteada a 1234`);
  } catch (error) { showToast(`❌ ${error.message}`); }
}

function adminChangePassword(id) {
  openAdminPasswordDialog(id);
}

function posEmoji(pos) { return {POR:'🧤',DEF:'🛡️',MED:'⚙️',DEL:'⚡'}[pos]||'' }

// ============================================================
