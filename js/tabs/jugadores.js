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
      ovr: getOverall(p),
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
  const rated = entries.filter(x => Number.isFinite(x.ovr));
  if (average) average.textContent = rated.length ? Math.round(rated.reduce((sum, x) => sum + x.ovr, 0) / rated.length) : '—';
  if (leader) {
    const top = rated.slice().sort((a,b) => b.ovr-a.ovr || a.p.name.localeCompare(b.p.name))[0];
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
    const ovrDiff = (Number.isFinite(b.ovr) ? b.ovr : -1) - (Number.isFinite(a.ovr) ? a.ovr : -1);
    if (rosterSort === 'performance') return b.ppp-a.ppp || b.rec.pj-a.rec.pj || ovrDiff;
    if (rosterSort === 'goals') return b.rec.goals-a.rec.goals || b.rec.pj-a.rec.pj || ovrDiff;
    if (rosterSort === 'assists') return b.rec.assists-a.rec.assists || b.rec.assistPj-a.rec.assistPj || ovrDiff;
    return ovrDiff || a.p.name.localeCompare(b.p.name);
  });

  renderRosterSummary(entries, visible);
  const sortSelect = document.getElementById('roster-sort');
  if (sortSelect && sortSelect.value !== rosterSort) sortSelect.value = rosterSort;

  if (!entries.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div>No hay jugadores aún</div></div>`;
    return;
  }
  if (!visible.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⌕</div><div>No encontramos a "${escapeHtml(rosterQuery)}"</div><div style="font-size:12px;margin-top:7px">Probá con otro nombre, usuario o posición.</div></div>`;
    return;
  }
  const highlights = getCardHighlights(entries);
  grid.innerHTML = visible.map(x => renderRosterPlayerCard(x.p, highlights, x.rec)).join('');
  // La autocalificación ("versión propia") ya no se muestra en el plantel:
  // se ve dentro del perfil de cada jugador, comparada contra el voto del grupo.
}

function hasSelfRating(p) {
  return p.ratings?.[p.id] && Object.keys(p.ratings[p.id]).length > 0;
}

function getSelfStats(p) {
  const r = p.ratings?.[p.id] || {};
  const stats = {};
  getRatingStats(p).forEach(s => { stats[s] = getStatValue(r, s); });
  return stats;
}

function getSelfOverall(p) {
  const stats = getSelfStats(p);
  const vals = getRatingStats(p).map(s => stats[s]).filter(v => v > 0);
  if (!vals.length) return null;
  const ovr = getOverallAttributeScore(p, stats);
  return Math.round(50 + (ovr-1)/4 * 49);
}

function cardStatsHTML(stats, player) {
  const pairs = getRatingStats(player).map(stat => {
    const raw = getStatValue(stats, stat);
    return [STAT_LABELS[stat], raw > 0 ? statToFifa(raw) : null];
  });
  const numeric = pairs.map(([,value]) => value).filter(Number.isFinite);
  const max = numeric.length ? Math.max(...numeric) : null;
  return pairs.map(([k,v]) =>
    `<div class="fifa-card-stat${v!==null && v===max && v>40 ? ' best' : ''}${v===null ? ' is-missing' : ''}"><span>${v === null ? '—' : v}</span><span>${k}</span></div>`
  ).join('');
}

function getCardHighlights(entries, scope) {
  const scopedMatches = Array.isArray(scope) ? scope : matches;
  // Acepta tanto `{p, rec}` (Plantel/Inicio) como filas planas de los
  // rankings temporales (`{p, goals, ...}`), sin recalcular datos históricos.
  const recordOf = entry => entry.rec || entry;
  const rankedByGoals = entries.filter(entry => (recordOf(entry).goals || 0) > 0);
  const maxGoals = rankedByGoals.length ? Math.max(...rankedByGoals.map(entry => recordOf(entry).goals || 0)) : 0;
  const topScorerIds = new Set(rankedByGoals.filter(entry => (recordOf(entry).goals || 0) === maxGoals).map(entry => entry.p.id));
  const visiblePlayerIds = new Set(entries.map(entry => entry.p?.id).filter(Boolean));
  const latestMvpMatch = scopedMatches
    .filter(m => isPlayed(m) && m.result?.mvp && visiblePlayerIds.has(m.result.mvp))
    .slice()
    .sort((a,b) => `${b.match_date||''}|${b.created_at||''}`.localeCompare(`${a.match_date||''}|${a.created_at||''}`))[0];
  return {
    topScorerIds,
    latestMvpId: latestMvpMatch?.result?.mvp || null,
    forms: new Map(entries.map(x => [x.p.id, getPlayerForm(x.p.id, scopedMatches)]))
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

function renderRosterPlayerCard(p, highlights, rec) {
  return renderFifaCard(p, highlights, 'roster', rec);
}

function renderFifaCard(p, highlights, variant, recordOverride, interactive = true) {
  highlights = highlights || { topScorerIds:new Set(), latestMvpId:null, forms:new Map() };
  const ovr = typeof rankingPlayerOverall === 'function' ? rankingPlayerOverall(p) : getOverall(p);
  const tier = getCardTier(ovr ?? 0);
  const pos = getEffectivePosition(p);
  const stats = getAvgStats(p) || {};
  const photoUrl = safePhotoUrl(p.photo);
  const initials = String(p.name || p.username || 'EF').trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase();
  const portrait = photoUrl
    ? `<div class="fifa-card-portrait"><img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(p.name)}"></div>`
    : `<div class="fifa-card-portrait is-placeholder" aria-hidden="true"><svg viewBox="0 0 120 130" fill="none"><path d="M40 18 15 33l11 23 13-6v62h42V50l13 6 11-23-25-15c-5 16-35 16-40 0Z" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="1.5"/><path d="M50 20c2 9 18 9 20 0M39 101h42" stroke="currentColor" stroke-opacity=".5"/></svg><span>${escapeHtml(initials)}</span></div>`;

  const rec = recordOverride || getPlayerRecord(p.id);
  const cardName = String(p.username || p.name || 'Jugador').toUpperCase();
  const nameClass = cardName.length > 17 ? ' is-very-long' : cardName.length > 11 ? ' is-long' : '';
  // Historial integrado junto al OVR. El registro se comparte entre variantes.
  const medal = (key, icon, label, value, description) => `<span class="fifa-medal is-${key}${value === null ? ' is-unrecorded' : ''}" data-career-metric="${key}" title="${escapeHtml(description)}" aria-label="${escapeHtml(description)}"><i aria-hidden="true">${icon}</i><b>${value === null ? '—' : value}</b><em>${label}</em></span>`;
  const medals = [
    medal('mvp', '★', 'MVP', rec.mvps, `${rec.mvps} veces MVP en partidos cerrados`),
    medal('goal', '⚽', 'GOLES', rec.goalPj > 0 ? rec.goals : null, rec.goalPj > 0 ? `${rec.goals} goles en ${rec.goalPj} partidos con planilla` : 'Goles: sin registro'),
    medal('assist', '↗', 'ASIST.', rec.assistPj > 0 ? rec.assists : null, rec.assistPj > 0 ? `${rec.assists} asistencias en ${rec.assistPj} partidos con registro completo` : 'Asistencias: sin registro')
  ].join('');
  const medalsHTML = `<div class="fifa-card-medals">${medals}</div>`;
  const recHTML = `<div class="fifa-card-record" aria-label="${rec.w} victorias, ${rec.d} empates, ${rec.l} derrotas">${rec.w}V · ${rec.d}E · ${rec.l}D</div>`;
  const form = highlights.forms.get(p.id);
  const isHot = form?.type === 'V' && form.streak >= 2;
  const isTopScorer = highlights.topScorerIds.has(p.id);
  const isLatestMvp = highlights.latestMvpId === p.id;
  const spotlights = cardSpotlightsHTML(p, highlights);
  const densityClass = variant === 'thumbnail' ? 'card-thumbnail' : variant === 'podium' ? 'card-podium' : variant === 'roster' ? 'card-full card-roster' : 'card-full';
  const cardClasses = [tier.cls, densityClass, ovr === null ? 'is-unrated' : '', isHot ? 'card-hot' : '', isTopScorer ? 'card-top-scorer' : '', isLatestMvp ? 'card-mvp' : '', spotlights ? 'has-card-spotlight' : ''].filter(Boolean).join(' ');
  // La cinta superior explica la edición. Misma prioridad de acentos
  // que en cards.css: racha < goleador < MVP.
  const frameLabel = isLatestMvp ? 'ÚLTIMO MVP'
    : isTopScorer ? 'GOLEADOR'
    : isHot ? `RACHA ${form.streak}V`
    : tier.label;

  const canOpenProfile = typeof isCurrentRosterPlayer === 'function'
    ? isCurrentRosterPlayer(p)
    : state.players.some(player => player.id === p.id);
  const profileAttrs = canOpenProfile && interactive
    ? `role="button" tabindex="0" aria-label="Ver ficha de ${escapeHtml(p.name)}" onclick="event.stopPropagation();openPlayerProfile('${p.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPlayerProfile('${p.id}')}"`
    : interactive
      ? `aria-label="${escapeHtml(p.name)} · jugador histórico"`
      : 'aria-hidden="true"';
  return `<div class="fifa-card ${cardClasses}${canOpenProfile ? '' : ' is-historical'}" ${profileAttrs}>
    <div class="fifa-card-ribbon"><span class="fifa-edition">EL FULBITO</span><div class="fifa-card-tier">${frameLabel}</div></div>
    ${portrait}
    <div class="fifa-top">
      <div class="fifa-left">
        <div class="fifa-card-overall">${ovr ?? '—'}</div>
        <div class="fifa-card-pos">${pos}</div>
      </div>
      ${medalsHTML}
    </div>
    <div class="fifa-divider"></div>
    <div class="fifa-card-name${nameClass}" title="${escapeHtml(p.name)}"><strong>${escapeHtml(cardName)}</strong>${p.username && String(p.name).toUpperCase() !== cardName ? `<small>${escapeHtml(p.name)}</small>` : ''}</div>
    <div class="fifa-card-stats">${cardStatsHTML(stats, p)}</div>
    <div class="fifa-meta"><span class="fifa-card-appearances" title="Partidos jugados"><b>${rec.pj}</b> PJ</span>${recHTML}</div>
    ${spotlights}
  </div>`;
}

function openPlayerProfile(id) {
  const p = state.players.find(x=>x.id===id);
  if (!p) return;
  closeModal('modal-profile');
  const ovr = getOverall(p);
  const tier = getCardTier(ovr ?? 0);
  const pos = getEffectivePosition(p);
  const stats = getAvgStats(p) || {};
  const profilePhotoUrl = safePhotoUrl(p.photo);
  const photo = profilePhotoUrl ? `<img src="${escapeHtml(profilePhotoUrl)}" alt="" style="width:100px;height:100px;border-radius:10px;object-fit:cover;border:2px solid var(--gold);display:block;margin:0 auto 12px">` : `<div style="font-size:64px;text-align:center;margin-bottom:12px">👤</div>`;

  const statBars = getRatingStats(p).map(s => {
    const raw = getStatValue(stats, s);
    const fifa = raw > 0 ? statToFifa(raw) : null;
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="color:var(--muted)">${STAT_LABELS[s]}</span>
        <span style="font-family:'Bebas Neue',sans-serif;font-size:16px">${fifa ?? '—'}</span>
      </div>
      <div style="height:4px;background:var(--bg3);border-radius:2px">
        <div style="height:4px;border-radius:2px;width:${fifa ?? 0}%;background:${fifa!==null && fifa>=75?'var(--gold)':fifa!==null && fifa>=60?'var(--green)':'var(--muted)'}"></div>
      </div>
    </div>`;
  }).join('');

  const validVoters = getValidRatings(p).length;
  const trimmedNote = validVoters >= 4 ? ' · extremos filtrados por atributo' : '';

  const rec = getPlayerRecord(p.id);
  const form = getPlayerForm(p.id);
  const formDots = form.last5.length
    ? `<span style="display:inline-flex;gap:3px;margin-left:6px;vertical-align:middle">${form.last5.map(x=>`<span class="form-dot ${x==='V'?'fd-v':x==='E'?'fd-e':'fd-d'}">${x}</span>`).join('')}</span>`
    : '';
  const recChip = rec.pj > 0
    ? `<div class="profile-metric is-record"><span>🏆 Rendimiento</span><b>${rec.w}V · ${rec.d}E · ${rec.l}D</b><small>${rec.pj} PJ · ${rec.pts} pts${rec.mvps>0?` · ⭐ ${rec.mvps} MVP`:''}</small></div>`
    : '';
  const goalChip = rec.goalPj > 0
    ? `<div class="profile-metric is-goal"><span>⚽ Goles</span><b>${rec.goals}</b><small>${(rec.goals/rec.goalPj).toFixed(2)} G/PJ · ${rec.goalPj} PJ registrados</small></div>`
    : '';
  const lastPlayerMatch = getPlayerMatchesChrono(p.id).slice(-1)[0];
  const lastMatchAssists = lastPlayerMatch && hasAssistsTracking(lastPlayerMatch)
    ? playerAssistTotal(p.id, [lastPlayerMatch])
    : null;
  const assistChip = rec.assistPj > 0
    ? `<div class="profile-metric is-assist"><span>🎯 Asistencias</span><b>${rec.assists}</b><small>${(rec.assists/rec.assistPj).toFixed(2)} A/PJ · ${rec.assistPj} PJ registrados${lastMatchAssists !== null ? ` · últ.: ${lastMatchAssists}` : ''}</small></div>`
    : '';

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
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${escapeHtml(label)}</div>
              <div style="font-size:12.5px;font-weight:600">${escapeHtml(val)}</div>
            </div>
          </div>`).join('')}
      </div>`;
    }
  }

  document.getElementById('modal-profile-title').textContent = p.name.toUpperCase();
  document.getElementById('modal-profile-content').innerHTML = `
      ${photo}
    <div style="text-align:center;margin-bottom:16px">
      <span style="font-family:'Bebas Neue',sans-serif;font-size:48px">${ovr ?? '—'}</span>
      <span style="display:block;color:var(--muted);font-size:13px">${ovr === null ? 'Sin calificar' : tier.label} · ${pos} · ${validVoters} voto${validVoters===1?'':'s'}${trimmedNote}</span>
      ${usesGoalkeeperStats(p) ? '<span style="display:block;color:var(--cyan);font-size:12px;margin-top:4px">🧤 Estadísticas de arquero</span>' : '<span style="display:block;color:var(--muted);font-size:12px;margin-top:4px">OVR de campo: los 6 atributos pesan igual. La posición no lo modifica.</span>'}
      <span style="display:block;color:var(--muted);font-size:12px;margin-top:4px">Posición secundaria: ${p.posSecondary||'-'}</span>
      ${(recChip || goalChip || assistChip) ? `<div class="profile-metrics">${recChip}${goalChip}${assistChip}</div>` : ''}
      ${form.last5.length ? `<div class="profile-form"><span>Forma reciente</span>${formDots}</div>` : ''}
    </div>
    <div>${statBars}</div>
    ${socHTML}
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
  editPosPrimary = me.posPrimary;
  editPosSecondary = me.posSecondary;
  editRatingMode = me.ratingMode || 'field';

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
      <input type="text" id="edit-name" value="${escapeHtml(me.name)}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:15px;outline:none">
    </div>
    <div class="form-group">
      <label>Usuario</label>
      <input type="text" id="edit-username" value="${escapeHtml(me.username)}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:15px;outline:none">
    </div>
    <div class="form-group">
      <label>Posición principal</label>
      <div class="pos-grid" id="edit-pos-primary">
        ${POSITIONS.map(pos=>`<div class="pos-btn${me.posPrimary===pos?' selected':''}" data-pos="${pos}" onclick="selectEditPos('primary',this)">${posEmoji(pos)} ${pos}</div>`).join('')}
      </div>
    </div>
    <div class="form-group hidden" id="edit-rating-mode-group"></div>
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
  renderEditRatingMode();
  openModal('modal-edit-profile');
}

let editPosPrimary = null, editPosSecondary = null, editRatingMode = 'field';
function selectEditPos(type, el) {
  el.closest('.pos-grid').querySelectorAll('.pos-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  if(type==='primary') editPosPrimary = el.dataset.pos;
  else editPosSecondary = el.dataset.pos;
  if (type === 'primary') renderEditRatingMode();
}

function renderEditRatingMode() {
  const group = document.getElementById('edit-rating-mode-group');
  if (!group) return;
  if (editPosPrimary !== 'POR') {
    editRatingMode = 'field';
    group.classList.add('hidden');
    group.innerHTML = '';
    return;
  }
  group.classList.remove('hidden');
  group.innerHTML = `
    <label>Tipo de estadísticas</label>
    <div class="pos-grid" id="edit-rating-mode">
      <button type="button" class="pos-btn${editRatingMode==='goalkeeper'?' selected':''}" onclick="selectEditRatingMode('goalkeeper')">🧤 Arquero</button>
      <button type="button" class="pos-btn${editRatingMode==='field'?' selected':''}" onclick="selectEditRatingMode('field')">⚽ Campo</button>
    </div>
    <div class="text-muted" style="font-size:12px;margin-top:7px">Al elegir arquero, tus compañeros verán Estirada, Manos, Saque, Reflejos, Posición y 1 vs 1.</div>`;
}

function selectEditRatingMode(mode) {
  editRatingMode = mode === 'goalkeeper' ? 'goalkeeper' : 'field';
  renderEditRatingMode();
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
      p_rating_mode: editRatingMode,
      p_photo: editPhotoData || null,
      p_current_password: currentPass || null,
      p_new_password: newPass || null
    });
    const saved = mapPlayers([data])[0];
    Object.assign(me, saved);
    state.currentUser.name = saved.name;
    state.currentUser.username = saved.username;
    SESSION.set({ ...state.currentUser, clubName: state.currentClub.name, clubCrest: state.currentClub.crest || null, clubCrestDesign: state.currentClub.crestDesign || null, clubInviteCode: state.currentUser.isAdmin ? state.currentClub.inviteCode || null : null });
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
    msgEl.innerHTML = `✅ Listo. Si existe esa cuenta, el pedido fue enviado al admin.<br><strong style="color:var(--gold)">El admin te informará la nueva contraseña.</strong>`;
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
  if (typeof canManageClubAccounts === 'function' && !canManageClubAccounts()) {
    showToast('⚠️ Los roles sólo puede cambiarlos un administrador del club.');
    return;
  }
  if (p.id === state.currentUser?.id) {
    showToast('⚠️ No podés cambiar tu propio rol. Pedile a otro administrador que lo haga.');
    return;
  }
  const nextIsAdmin = !p.isAdmin;
  if (!nextIsAdmin && state.players.filter(player => player.isAdmin).length <= 1) {
    showToast('⚠️ El club debe conservar al menos un administrador.');
    return;
  }
  const accepted = await confirmAppAction({
    title: nextIsAdmin ? 'ASIGNAR ADMINISTRADOR' : 'QUITAR ADMINISTRADOR',
    message: nextIsAdmin
      ? `${p.name} (@${p.username}) podrá administrar usuarios, identidad y datos del club.`
      : `${p.name} (@${p.username}) dejará de poder administrar usuarios y configuración del club.`,
    confirmText: nextIsAdmin ? 'Sí, hacer admin' : 'Sí, quitar acceso',
    danger: !nextIsAdmin
  });
  if (!accepted) return;
  try {
    const data = await callRpc('fulbito_set_admin', { p_club_id: state.currentClub.id, p_player_id: id, p_is_admin: nextIsAdmin });
    const saved = data ? mapPlayers([data])[0] : null;
    if (!saved || saved.id !== p.id || saved.isAdmin !== nextIsAdmin) throw new Error('El servidor no confirmó el cambio de rol.');
    Object.assign(p, saved);
    renderAdmin();
    showToast(p.isAdmin ? `👑 ${p.username} es admin` : `${p.username} ya no es admin`);
  } catch (error) { showToast(`❌ ${error.message}`); }
}

function adminChangePassword(id) {
  openAdminPasswordDialog(id);
}

function posEmoji(pos) { return {POR:'🧤',DEF:'🛡️',MED:'⚙️',DEL:'⚡'}[pos]||'' }

// ============================================================
