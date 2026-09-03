// TEAMS TAB
// ============================================================
let numTeamsSelected = 2;
let fieldSelected = 5;
const TEAM_FIELD_CAPACITIES = Object.freeze({ 5: 5, 8: 8, 11: 11 });

function renderTeamsTab() {
  updateFieldSelectionUI();
  if (state.builtTeams) renderBuiltTeams(state.builtTeams);
}

function selectField(n) {
  if (!TEAM_FIELD_CAPACITIES[n]) return;
  fieldSelected = n;
  updateFieldSelectionUI();
  if (state.builtTeams) {
    const validation = validateBuiltTeams(state.builtTeams);
    if (!validation.valid) showToast(`⚠️ ${validation.errors[0]}`, 3600);
    renderBuiltTeams(state.builtTeams);
  }
}

function updateFieldSelectionUI() {
  [5,8,11].forEach(x => {
    const button = document.getElementById('field-'+x);
    if (!button) return;
    const selected = x === fieldSelected;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const note = document.getElementById('field-capacity-note');
  if (note) note.textContent = `Podés jugar con menos. F${fieldSelected} admite como máximo ${fieldSelected} jugadores en cada equipo.`;
}

function setNumTeams(n) {
  if (![2,3].includes(n)) return;
  numTeamsSelected = n;
  const twoButton = document.getElementById('teams-2-btn');
  const threeButton = document.getElementById('teams-3-btn');
  if (twoButton) {
    twoButton.style.borderColor = n===2?'var(--gold)':'var(--border)';
    twoButton.style.color = n===2?'var(--gold)':'var(--text)';
  }
  if (threeButton) {
    threeButton.style.borderColor = n===3?'var(--gold)':'var(--border)';
    threeButton.style.color = n===3?'var(--gold)':'var(--text)';
  }
}

// ============================================================
// GUESTS
// ============================================================
let guests = [];
let guestStats = {};
const TEAM_BALANCE_NEUTRAL_OVR = 60;

// Los equipos armados y los invitados son un borrador estrictamente local al
// club/sesión actual. Limpiarlos también del DOM evita que el plantel anterior
// reaparezca al entrar a la pestaña Equipos después de cambiar de club.
function resetTeamDraftState() {
  state.builtTeams = null;
  state.teamsEditMode = false;
  guests = [];
  guestStats = {};
  lastSeed = 0;
  const guestsList = document.getElementById('guests-list');
  const teamsResult = document.getElementById('teams-result');
  if (guestsList) guestsList.innerHTML = '';
  if (teamsResult) teamsResult.innerHTML = '';
}

function getTeamPlayerRatedOvr(player) {
  const stored = Number(player?.ovr);
  if (player?.ovr !== null && player?.ovr !== undefined && Number.isFinite(stored) && stored > 0) {
    return Math.round(stored);
  }
  if (player?.isGuest) return null;
  const calculated = getOverall(player);
  return Number.isFinite(calculated) ? calculated : null;
}

function getTeamPlayerBalanceScore(player) {
  const stored = Number(player?.balanceOvr);
  if (player?.balanceOvr !== null && player?.balanceOvr !== undefined && Number.isFinite(stored)) return stored;
  return getTeamPlayerRatedOvr(player) ?? TEAM_BALANCE_NEUTRAL_OVR;
}

function getTeamRatedAverage(players) {
  const values = (players || []).map(getTeamPlayerRatedOvr).filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function getTeamPlayerPosition(player) {
  return player?.effPos || player?.pos || (typeof getEffectivePosition === 'function' ? getEffectivePosition(player) : null);
}

function isTeamGoalkeeper(player) {
  return getTeamPlayerPosition(player) === 'POR';
}

function recalculateTeamTotal(team) {
  team.total = (team.players || []).reduce((sum, player) => sum + getTeamPlayerBalanceScore(player), 0);
  return team.total;
}

// Contrato reutilizable antes de persistir un partido. El formato F5/F8/F11
// representa el cupo máximo por equipo; jugar con menos personas sigue siendo
// válido. Los equipos deben conservar tamaños parejos y, cuando hay arqueros
// suficientes, uno por equipo.
function validateBuiltTeams(teams, options = {}) {
  const errors = [];
  const warnings = [];
  const fieldSize = Number(options.fieldSize ?? fieldSelected);
  const capacity = TEAM_FIELD_CAPACITIES[fieldSize] || null;
  const minPlayersPerTeam = Number.isFinite(options.minPlayersPerTeam)
    ? Math.max(1, options.minPlayersPerTeam)
    : 2;

  if (!Array.isArray(teams) || ![2,3].includes(teams.length)) {
    return { valid:false, errors:['El partido debe tener 2 o 3 equipos.'], warnings, fieldSize, capacity, sizes:[] };
  }

  const sizes = teams.map(team => Array.isArray(team?.players) ? team.players.length : 0);
  teams.forEach((team, index) => {
    const label = `Equipo ${String.fromCharCode(65 + index)}`;
    if (!Array.isArray(team?.players)) errors.push(`${label} no tiene una lista de jugadores válida.`);
    else if (team.players.length < minPlayersPerTeam) {
      errors.push(`${label} necesita al menos ${minPlayersPerTeam} jugadores.`);
    }
    if (capacity && team?.players?.length > capacity) {
      errors.push(`${label} supera el cupo de F${fieldSize}: ${team.players.length}/${capacity}.`);
    }
  });

  if (sizes.length && Math.max(...sizes) - Math.min(...sizes) > 1) {
    errors.push('Los equipos deben tener cantidades parejas (como máximo un jugador de diferencia).');
  }

  const playerIds = [];
  teams.forEach(team => (team?.players || []).forEach(player => {
    if (!player?.id) errors.push('Hay un jugador sin identificación.');
    else playerIds.push(String(player.id));
  }));
  const duplicateIds = [...new Set(playerIds.filter((id, index) => playerIds.indexOf(id) !== index))];
  if (duplicateIds.length) errors.push('Un mismo jugador aparece en más de un equipo.');

  const goalkeeperCounts = teams.map(team => (team?.players || []).filter(isTeamGoalkeeper).length);
  const totalGoalkeepers = goalkeeperCounts.reduce((sum, count) => sum + count, 0);
  if (totalGoalkeepers >= teams.length && goalkeeperCounts.some(count => count === 0)) {
    errors.push('Hay arqueros suficientes: cada equipo debe conservar al menos uno.');
  } else if (totalGoalkeepers < teams.length) {
    warnings.push(`Hay ${totalGoalkeepers} arquero${totalGoalkeepers === 1 ? '' : 's'} para ${teams.length} equipos.`);
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    fieldSize,
    capacity,
    sizes,
    goalkeeperCounts
  };
}

function showTeamValidationError(validation) {
  if (!validation?.valid) showToast(`⚠️ ${validation?.errors?.[0] || 'Revisá los equipos.'}`, 4000);
  return !!validation?.valid;
}

function addGuest() {
  guestStats = {};
  document.getElementById('modal-guest-content').innerHTML = `
    <div class="form-group">
      <label>Nombre</label>
      <input type="text" id="guest-name" maxlength="48" autocomplete="off" placeholder="Ej: Rodrigo" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:15px;outline:none">
    </div>
    <div class="form-group">
      <label>Posición</label>
      <div class="pos-grid" id="guest-pos">
        ${['POR','DEF','MED','DEL'].map(p=>`<div class="pos-btn" data-pos="${p}" onclick="selectGuestPos(this)">${posEmoji(p)} ${p}</div>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Calificación</div>
      ${STATS.map(s => {
        const val = guestStats[s] || 0;
        return `<div class="rate-stars-row">
          <div class="rate-stars-label">${STAT_LABELS[s]}</div>
          <div class="stars" id="gstars-${s}">
            ${[1,2,3,4,5].map(n=>`<span class="star${n<=val?' lit':''}" onclick="rateGuestStat('${s}',${n})">★</span>`).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>
    <div id="guest-error" style="color:var(--red);font-size:13px;display:none;margin-bottom:8px"></div>
    <button class="btn btn-primary w-full" style="justify-content:center" onclick="saveGuest()">➕ Agregar al partido</button>
  `;
  openModal('modal-guest');
}

function selectGuestPos(el) {
  document.querySelectorAll('#guest-pos .pos-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
}

function rateGuestStat(stat, val) {
  guestStats[stat] = val;
  const container = document.getElementById(`gstars-${stat}`);
  if (container) {
    container.innerHTML = [1,2,3,4,5].map(n=>`<span class="star${n<=val?' lit':''}" onclick="rateGuestStat('${stat}',${n})">★</span>`).join('');
  }
}

function saveGuest() {
  const name = document.getElementById('guest-name').value.trim();
  const posSel = document.querySelector('#guest-pos .pos-btn.selected');
  const errEl = document.getElementById('guest-error');
  errEl.style.display = 'none';

  if (!name) { errEl.textContent='Ingresá el nombre'; errEl.style.display='block'; return; }
  if (name.length > 48 || /[<>\u0000-\u001F\u007F]/.test(name)) { errEl.textContent='Usá un nombre de hasta 48 caracteres, sin símbolos < o >'; errEl.style.display='block'; return; }
  if (!posSel) { errEl.textContent='Elegí una posición'; errEl.style.display='block'; return; }

  const pos = posSel.dataset.pos;
  const avg = {};
  STATS.forEach(s => { avg[s] = guestStats[s] || 0; });
  let ovr;
  if (pos==='POR') ovr = avg.ataque*0.4 + avg.ritmo*0.15 + avg.fisico*0.25 + avg.pase*0.1 + avg.defensa*0.1;
  else if (pos==='DEF') ovr = avg.defensa*0.35 + avg.fisico*0.2 + avg.ritmo*0.2 + avg.pase*0.15 + avg.tiro*0.1;
  else if (pos==='MED') ovr = avg.pase*0.35 + avg.ritmo*0.2 + avg.defensa*0.15 + avg.tiro*0.15 + avg.fisico*0.15;
  else ovr = avg.tiro*0.4 + avg.ritmo*0.25 + avg.pase*0.15 + avg.fisico*0.15 + avg.defensa*0.05;
  const finalOvr = Object.keys(guestStats).length > 0
    ? Math.max(40, Math.min(99, Math.round(50 + (ovr - 1) / 4 * 49)))
    : null;

  const guest = {
    id: 'guest_' + Date.now(),
    name,
    username: name.toLowerCase(),
    ovr: finalOvr,
    balanceOvr: finalOvr ?? TEAM_BALANCE_NEUTRAL_OVR,
    effPos: pos,
    isGuest: true,
    stats: { ...guestStats }
  };
  guests.push(guest);
  renderGuestsList();
  closeModal('modal-guest');
  showToast(`👤 ${name} agregado (${pos} · ${finalOvr === null ? 'S/C' : `OVR ${finalOvr}`})`);
}

function removeGuest(id) {
  guests = guests.filter(g => g.id !== id);
  renderGuestsList();
}

function renderGuestsList() {
  const el = document.getElementById('guests-list');
  if (!guests.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Invitados</div>
    ${guests.map(g => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
        <span style="font-size:18px">👤</span>
        <span style="flex:1;font-weight:600">${escapeHtml(g.name)}</span>
        <span style="font-size:12px;color:var(--muted)">${getTeamPlayerRatedOvr(g) === null ? 'S/C' : `OVR ${getTeamPlayerRatedOvr(g)}`}</span>
        <select class="guest-pos-select" data-guest-id="${escapeHtml(g.id)}" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:3px 6px;font-size:12px">
          ${['POR','DEF','MED','DEL'].map(p=>`<option value="${p}"${g.effPos===p?' selected':''}>${p}</option>`).join('')}
        </select>
        <button type="button" class="guest-remove-btn" data-guest-id="${escapeHtml(g.id)}" aria-label="Quitar a ${escapeHtml(g.name)}" style="background:none;border:none;cursor:pointer;font-size:16px">🗑️</button>
      </div>
    `).join('')}
  `;
  el.querySelectorAll('.guest-pos-select').forEach(select => select.addEventListener('change', () => updateGuestPos(select.dataset.guestId, select.value)));
  el.querySelectorAll('.guest-remove-btn').forEach(button => button.addEventListener('click', () => removeGuest(button.dataset.guestId)));
}

function updateGuestPos(id, pos) {
  const g = guests.find(x => x.id === id);
  if (g) g.effPos = pos;
}

// ============================================================
// TEAMS — snake draft + balance
// ============================================================
let lastSeed = 0;

function buildTeams(reshuffle = false) {
  const going = state.players.filter(p => p.attendance === 'going');
  const allPlayers = [
    ...going.map(p => {
      const ratedOvr = getOverall(p);
      return {
        ...p,
        // `ovr` es sólo el valor real que puede mostrarse y archivarse.
        // El 60 neutral vive aparte y se usa únicamente para balancear.
        ovr: Number.isFinite(ratedOvr) ? ratedOvr : null,
        balanceOvr: Number.isFinite(ratedOvr) ? ratedOvr : TEAM_BALANCE_NEUTRAL_OVR,
        effPos: getEffectivePosition(p),
        isGuest: false
      };
    }),
    ...guests
  ];

  if (allPlayers.length < numTeamsSelected * 2) {
    showToast(`⚠️ Se necesitan al menos ${numTeamsSelected * 2} jugadores para armar ${numTeamsSelected} equipos`);
    return;
  }

  const totalCapacity = fieldSelected * numTeamsSelected;
  if (allPlayers.length > totalCapacity) {
    showToast(`⚠️ F${fieldSelected} admite hasta ${totalCapacity} jugadores en ${numTeamsSelected} equipos. Elegí otro formato o sumá un equipo.`, 4400);
    return;
  }

  if (reshuffle) lastSeed = Date.now();
  const rng = seededRandom(lastSeed || 0);

  const scored = allPlayers
    .map(p => ({ ...p, sortKey: getTeamPlayerBalanceScore(p) + (reshuffle ? (rng() - 0.5) * 8 : 0) }))
    .sort((a,b) => b.sortKey - a.sortKey);

  const n = numTeamsSelected;
  const teams = Array.from({ length: n }, () => ({ players:[], total:0 }));

  scored.forEach((p, i) => {
    const round = Math.floor(i / n);
    const posInRound = i % n;
    const teamIdx = round % 2 === 0 ? posInRound : (n - 1 - posInRound);
    teams[teamIdx].players.push(p);
    teams[teamIdx].total += getTeamPlayerBalanceScore(p);
  });

  ensureGoalkeeperCoverage(teams);
  balancePositions(teams);
  ensureGoalkeeperCoverage(teams);

  const validation = validateBuiltTeams(teams);
  if (!showTeamValidationError(validation)) return;

  state.builtTeams = teams;
  state.teamsEditMode = false;
  renderBuiltTeams(teams);
}

function seededRandom(seed) {
  let s = seed || 1;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function swapPreservesGoalkeeperCoverage(team1, team2, player1, player2) {
  const team1Goalkeepers = team1.players.filter(isTeamGoalkeeper).length;
  const team2Goalkeepers = team2.players.filter(isTeamGoalkeeper).length;
  const nextTeam1 = team1Goalkeepers - Number(isTeamGoalkeeper(player1)) + Number(isTeamGoalkeeper(player2));
  const nextTeam2 = team2Goalkeepers - Number(isTeamGoalkeeper(player2)) + Number(isTeamGoalkeeper(player1));
  return nextTeam1 > 0 && nextTeam2 > 0;
}

function teamBalanceSpread(teams, overrides = new Map()) {
  const totals = teams.map((team, index) => overrides.has(index) ? overrides.get(index) : team.total);
  return Math.max(...totals) - Math.min(...totals);
}

function ensureGoalkeeperCoverage(teams) {
  if (!Array.isArray(teams) || !teams.length) return false;
  teams.forEach(team => {
    if (!Number.isFinite(team.total)) recalculateTeamTotal(team);
  });
  const totalGoalkeepers = teams.reduce((sum, team) => sum + team.players.filter(isTeamGoalkeeper).length, 0);
  if (totalGoalkeepers < teams.length) return false;

  let missing = teams.map((team, index) => ({ team, index }))
    .filter(({ team }) => !team.players.some(isTeamGoalkeeper));

  while (missing.length) {
    const target = missing[0];
    const donors = teams.map((team, index) => ({ team, index }))
      .filter(({ team }) => team.players.filter(isTeamGoalkeeper).length > 1);
    let best = null;

    donors.forEach(donor => {
      donor.team.players.forEach((goalkeeper, goalkeeperIndex) => {
        if (!isTeamGoalkeeper(goalkeeper)) return;
        target.team.players.forEach((replacement, replacementIndex) => {
          if (isTeamGoalkeeper(replacement)) return;
          const goalkeeperScore = getTeamPlayerBalanceScore(goalkeeper);
          const replacementScore = getTeamPlayerBalanceScore(replacement);
          const donorTotal = donor.team.total - goalkeeperScore + replacementScore;
          const targetTotal = target.team.total - replacementScore + goalkeeperScore;
          const spread = teamBalanceSpread(teams, new Map([
            [donor.index, donorTotal],
            [target.index, targetTotal]
          ]));
          if (!best || spread < best.spread) {
            best = { donor, target, goalkeeper, replacement, goalkeeperIndex, replacementIndex, donorTotal, targetTotal, spread };
          }
        });
      });
    });

    if (!best) break;
    best.donor.team.players[best.goalkeeperIndex] = best.replacement;
    best.target.team.players[best.replacementIndex] = best.goalkeeper;
    best.donor.team.total = best.donorTotal;
    best.target.team.total = best.targetTotal;
    missing = teams.map((team, index) => ({ team, index }))
      .filter(({ team }) => !team.players.some(isTeamGoalkeeper));
  }

  return teams.every(team => team.players.some(isTeamGoalkeeper));
}

function balancePositions(teams) {
  const n = teams.length;
  const preserveGoalkeepers = teams.reduce((sum, team) => sum + team.players.filter(isTeamGoalkeeper).length, 0) >= n
    && teams.every(team => team.players.some(isTeamGoalkeeper));
  for (let t1 = 0; t1 < n; t1++) {
    for (let t2 = t1+1; t2 < n; t2++) {
      const team1 = teams[t1], team2 = teams[t2];
      for (let a = 0; a < team1.players.length; a++) {
        for (let b = 0; b < team2.players.length; b++) {
          const pa = team1.players[a], pb = team2.players[b];
          if (getTeamPlayerPosition(pa) === getTeamPlayerPosition(pb)) continue;
          if (preserveGoalkeepers && !swapPreservesGoalkeeperCoverage(team1, team2, pa, pb)) continue;
          const currDiff = Math.abs(team1.total - team2.total);
          const paScore = getTeamPlayerBalanceScore(pa);
          const pbScore = getTeamPlayerBalanceScore(pb);
          const newT1 = team1.total - paScore + pbScore;
          const newT2 = team2.total - pbScore + paScore;
          const newDiff = Math.abs(newT1 - newT2);
          if (newDiff <= currDiff + 2) {
            team1.players[a] = pb; team2.players[b] = pa;
            team1.total = newT1; team2.total = newT2;
          }
        }
      }
    }
  }
}

function renderBuiltTeams(teams) {
  const container = document.getElementById('teams-result');
  if (!teams || !teams.length) { container.innerHTML = ''; return; }

  state.builtTeams = teams;
  const isAdmin = state.currentUser && state.currentUser.isAdmin;
  const editMode = state.teamsEditMode || false;

  const teamColors = ['team-a','team-b','team-c'];
  const teamNames = ['EQUIPO A','EQUIPO B','EQUIPO C'];
  const validation = validateBuiltTeams(teams);

  function teamOvr(team) {
    return getTeamRatedAverage(team);
  }

  let html = '';

  html += `<div class="team-build-summary">
    <strong>Formato F${validation.fieldSize} · máximo ${validation.capacity} por equipo</strong>
    <span>${validation.sizes.map((size, index) => `Equipo ${teamNames[index]?.slice(-1) || index + 1}: ${size}/${validation.capacity}`).join(' · ')}</span>
  </div>`;

  if (!validation.valid) {
    html += `<div class="team-validation-banner">${validation.errors.map(error => `• ${escapeHtml(error)}`).join('<br>')}</div>`;
  } else if (validation.warnings.length) {
    html += `<div class="team-validation-banner" style="border-color:rgba(240,192,64,.4);background:rgba(240,192,64,.08);color:#fde68a">${validation.warnings.map(warning => `• ${escapeHtml(warning)}`).join('<br>')}</div>`;
  }

  if (isAdmin) {
    if (!editMode) {
      html += `<button class="btn btn-ghost w-full" style="margin-bottom:12px;justify-content:center;border-color:var(--gold);color:var(--gold)" onclick="state.teamsEditMode=true;renderBuiltTeams(state.builtTeams)">✏️ Editar equipos</button>`;
    } else {
      html += `<button class="btn btn-green w-full" style="margin-bottom:12px;justify-content:center" onclick="confirmTeamEdits()">✅ Confirmar equipos</button>`;
      html += `<div style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:12px;letter-spacing:.5px">MODO EDICIÓN — usá las flechas para mover jugadores entre equipos</div>`;
    }
  }

  html += `<div class="teams-container">`;

  teams.forEach((team, ti) => {
    const colorClass = teamColors[ti] || 'team-a';
    const ovr = teamOvr(team.players);
    const unratedCount = team.players.filter(player => getTeamPlayerRatedOvr(player) === null).length;
    html += `<div class="team-card">
      <div class="team-header ${colorClass}">
        <span>${teamNames[ti] || 'EQUIPO '+(ti+1)}</span>
        <span class="team-overall">OVR ${ovr ?? '—'}${unratedCount ? ` · ${unratedCount} S/C` : ''} · ${team.players.length}v</span>
      </div>`;

    team.players.forEach((p, pi) => {
      const pos = p.effPos || getEffectivePosition(p);
      const ovr = getTeamPlayerRatedOvr(p);
      html += `<div class="team-player-row" style="${editMode?'padding-right:8px':''}">
        <span class="team-player-pos-badge">${pos}</span>
        <span class="team-player-name">${escapeHtml(p.name)}</span>
        <span class="team-player-ovr">${ovr ?? 'S/C'}</span>`;

      if (editMode && teams.length > 1) {
        const numTeams = teams.length;
        if (numTeams === 2) {
          const toLetter = ti === 0 ? 'B' : 'A';
          html += `<button onclick="fulbitoMovePlayer(${ti},${pi},${ti===0?1:-1})" style="background:rgba(240,192,64,0.15);border:1px solid var(--gold);border-radius:6px;color:var(--gold);cursor:pointer;font-size:11px;padding:4px 8px;font-weight:700;white-space:nowrap">→ ${toLetter}</button>`;
        } else {
          html += `<div class="team-edit-controls">
            <button onclick="fulbitoMovePlayer(${ti},${pi},-1)" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;padding:4px 8px;font-size:12px">◀</button>
            <button onclick="fulbitoMovePlayer(${ti},${pi},1)" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;padding:4px 8px;font-size:12px">▶</button>
          </div>`;
        }
      }

      html += `</div>`;
    });

    html += `</div>`;
  });

  html += `</div>`;

  // Pronóstico (solo con 2 equipos)
  html += getForecastHTML(teams);

  // Botón reroll
  html += `<button class="btn btn-ghost w-full" style="margin-top:12px;justify-content:center" onclick="buildTeams(true)">🎲 Reroll equipos</button>`;

  // Compartir por WhatsApp (todos)
  html += `<button class="btn btn-ghost w-full" style="margin-top:8px;justify-content:center" onclick="shareTeams()">📲 Compartir equipos</button>`;

  // Guardar partido (admin, fuera de modo edición)
  if (isAdmin && !editMode) {
    html += `<button class="btn btn-primary w-full" style="margin-top:8px;justify-content:center" onclick="saveValidatedMatchFromTeams()">💾 Guardar partido y abrir planilla de goles</button>`;
  }

  container.innerHTML = html;
}

function fulbitoMovePlayer(fromTeamIdx, playerIdx, direction) {
  const teams = state.builtTeams;
  if (!Array.isArray(teams)) return false;
  const numTeams = teams.length;
  const toTeamIdx = (fromTeamIdx + direction + numTeams) % numTeams;
  const source = teams[fromTeamIdx];
  const target = teams[toTeamIdx];
  if (!source?.players?.[playerIdx] || !target?.players) return false;
  if (source.players.length <= 1) {
    showToast('⚠️ No podés dejar un equipo vacío');
    return false;
  }
  if (target.players.length >= fieldSelected) {
    showToast(`⚠️ Equipo ${String.fromCharCode(65 + toTeamIdx)} ya alcanzó el cupo de F${fieldSelected}`);
    return false;
  }
  const [player] = teams[fromTeamIdx].players.splice(playerIdx, 1);
  teams[toTeamIdx].players.push(player);
  recalculateTeamTotal(source);
  recalculateTeamTotal(target);
  renderBuiltTeams(teams);
  return true;
}

function confirmTeamEdits() {
  const validation = validateBuiltTeams(state.builtTeams);
  if (!showTeamValidationError(validation)) {
    state.teamsEditMode = true;
    renderBuiltTeams(state.builtTeams);
    return false;
  }
  state.teamsEditMode = false;
  renderBuiltTeams(state.builtTeams);
  showToast('✅ Equipos confirmados');
  return true;
}

async function saveValidatedMatchFromTeams() {
  const validation = validateBuiltTeams(state.builtTeams);
  if (!showTeamValidationError(validation)) {
    renderBuiltTeams(state.builtTeams);
    return false;
  }
  if (typeof saveMatchFromTeams !== 'function') {
    showToast('❌ No se pudo abrir el guardado del partido');
    return false;
  }
  return saveMatchFromTeams();
}

// Compartir equipos como texto (WhatsApp / clipboard)
async function shareTeams() {
  const teams = state.builtTeams;
  if (!teams || !teams.length) return;

  function teamOvr(team) {
    return getTeamRatedAverage(team.players) ?? '—';
  }

  const clubName = safePlainText(state.currentClub?.name, 50) || 'FULBITO';
  let text = `⚽ ${clubName.toLocaleUpperCase('es-AR')} ⚽\n`;
  teams.forEach((t, i) => {
    text += `\n${TEAM_EMOJIS[i]||'⚪'} EQUIPO ${TEAM_NAMES[i]||i+1} (OVR ${teamOvr(t)})\n`;
    t.players.forEach(p => {
      text += `• ${p.name} (${p.effPos||'?'})${p.isGuest?' 👤':''}\n`;
    });
  });
  text += '\n¡Nos vemos en la cancha! 🔥';

  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e?.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('📋 Equipos copiados — pegalos en WhatsApp');
  } catch(e) {
    showToast('❌ No se pudo copiar');
  }
}

// Pronóstico del partido: OVR promedio + forma reciente (últimos 5)
function getTeamFormAvg(team) {
  const vals = [];
  team.players.forEach(p => {
    if (p.isGuest) return;
    const f = getPlayerForm(p.id);
    if (f.last5.length) {
      const pts = f.last5.reduce((a,x) => a + (x==='V'?3:x==='E'?1:0), 0) / f.last5.length;
      vals.push(pts);
    }
  });
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 1.5; // 1.5 = neutro
}

function getForecastHTML(teams) {
  if (!teams || teams.length !== 2) return '';
  if (!teams[0].players.length || !teams[1].players.length) return '';
  const avgOvr = t => {
    const v = t.players.map(getTeamPlayerBalanceScore);
    return v.reduce((a,b)=>a+b,0)/v.length;
  };
  const oA = avgOvr(teams[0]), oB = avgOvr(teams[1]);
  const fA = getTeamFormAvg(teams[0]), fB = getTeamFormAvg(teams[1]);
  const score = (oA - oB) + (fA - fB) * 4;
  const pA = Math.max(5, Math.min(95, Math.round(100 / (1 + Math.pow(10, -score/12)))));
  const pB = 100 - pA;
  const label = Math.abs(pA-pB) <= 6 ? '⚖️ Partido parejo' : (pA > pB ? '🔵 Favorito: Equipo A' : '🔴 Favorito: Equipo B');
  return `<div style="margin-top:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 14px;box-shadow:var(--shadow-card)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">🔮 Pronóstico (balance + forma)</span>
      <span style="font-size:11px;font-weight:700">${label}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;font-family:'Bebas Neue',sans-serif;font-size:16px">
      <span style="color:#60a5fa;min-width:52px">A ${pA}%</span>
      <div style="flex:1;height:8px;border-radius:4px;overflow:hidden;display:flex;background:var(--bg3)">
        <div style="width:${pA}%;background:linear-gradient(90deg,#2563eb,#3b82f6)"></div>
        <div style="width:${pB}%;background:linear-gradient(90deg,#ef4444,#dc2626)"></div>
      </div>
      <span style="color:#f87171;min-width:52px;text-align:right">${pB}% B</span>
    </div>
  </div>`;
}

// ============================================================
