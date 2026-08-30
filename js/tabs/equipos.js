// TEAMS TAB
// ============================================================
let numTeamsSelected = 2;
let fieldSelected = 5;

function renderTeamsTab() {
  if (state.builtTeams) renderBuiltTeams(state.builtTeams);
}

function selectField(n) {
  fieldSelected = n;
  [5,8,11].forEach(x => document.getElementById('field-'+x).classList.toggle('selected', x===n));
}

function setNumTeams(n) {
  numTeamsSelected = n;
  document.getElementById('teams-2-btn').style.borderColor = n===2?'var(--gold)':'var(--border)';
  document.getElementById('teams-2-btn').style.color = n===2?'var(--gold)':'var(--text)';
  document.getElementById('teams-3-btn').style.borderColor = n===3?'var(--gold)':'var(--border)';
  document.getElementById('teams-3-btn').style.color = n===3?'var(--gold)':'var(--text)';
}

// ============================================================
// GUESTS
// ============================================================
let guests = [];
let guestStats = {};

function addGuest() {
  guestStats = {};
  document.getElementById('modal-guest-content').innerHTML = `
    <div class="form-group">
      <label>Nombre</label>
      <input type="text" id="guest-name" placeholder="Ej: Rodrigo" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:15px;outline:none">
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
  if (!posSel) { errEl.textContent='Elegí una posición'; errEl.style.display='block'; return; }

  const pos = posSel.dataset.pos;
  const avg = {};
  STATS.forEach(s => { avg[s] = guestStats[s] || 0; });
  let ovr;
  if (pos==='POR') ovr = avg.atajadas*0.4 + avg.ritmo*0.15 + avg.fisico*0.25 + avg.pase*0.1 + avg.defensa*0.1;
  else if (pos==='DEF') ovr = avg.defensa*0.35 + avg.fisico*0.2 + avg.ritmo*0.2 + avg.pase*0.15 + avg.tiro*0.1;
  else if (pos==='MED') ovr = avg.pase*0.35 + avg.ritmo*0.2 + avg.defensa*0.15 + avg.tiro*0.15 + avg.fisico*0.15;
  else ovr = avg.tiro*0.4 + avg.ritmo*0.25 + avg.pase*0.15 + avg.fisico*0.15 + avg.defensa*0.05;
  const finalOvr = Object.keys(guestStats).length > 0
    ? Math.round(50 + (ovr - 1) / 4 * 49)
    : 60;

  const guest = {
    id: 'guest_' + Date.now(),
    name,
    username: name.toLowerCase(),
    ovr: finalOvr,
    effPos: pos,
    isGuest: true,
    stats: { ...guestStats }
  };
  guests.push(guest);
  renderGuestsList();
  closeModal('modal-guest');
  showToast(`👤 ${name} agregado (${pos} · OVR ${finalOvr})`);
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
        <span style="flex:1;font-weight:600">${g.name}</span>
        <span style="font-size:12px;color:var(--muted)">OVR ${g.ovr}</span>
        <select onchange="updateGuestPos('${g.id}',this.value)" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:3px 6px;font-size:12px">
          ${['POR','DEF','MED','DEL'].map(p=>`<option value="${p}"${g.effPos===p?' selected':''}>${p}</option>`).join('')}
        </select>
        <button onclick="removeGuest('${g.id}')" style="background:none;border:none;cursor:pointer;font-size:16px">🗑️</button>
      </div>
    `).join('')}
  `;
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
    ...going.map(p => ({
      ...p,
      ovr: getOverall(p) || 60,
      effPos: getEffectivePosition(p),
      isGuest: false
    })),
    ...guests
  ];

  if (allPlayers.length < numTeamsSelected * 2) {
    showToast('⚠️ No hay suficientes jugadores');
    return;
  }

  if (reshuffle) lastSeed = Date.now();
  const rng = seededRandom(lastSeed || 0);

  const scored = allPlayers
    .map(p => ({ ...p, sortKey: p.ovr + (reshuffle ? (rng() - 0.5) * 8 : 0) }))
    .sort((a,b) => b.sortKey - a.sortKey);

  const n = numTeamsSelected;
  const teams = Array.from({ length: n }, () => ({ players:[], total:0 }));

  scored.forEach((p, i) => {
    const round = Math.floor(i / n);
    const posInRound = i % n;
    const teamIdx = round % 2 === 0 ? posInRound : (n - 1 - posInRound);
    teams[teamIdx].players.push(p);
    teams[teamIdx].total += p.ovr;
  });

  balancePositions(teams);

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

function balancePositions(teams) {
  const n = teams.length;
  for (let t1 = 0; t1 < n; t1++) {
    for (let t2 = t1+1; t2 < n; t2++) {
      const team1 = teams[t1], team2 = teams[t2];
      for (let a = 0; a < team1.players.length; a++) {
        for (let b = 0; b < team2.players.length; b++) {
          const pa = team1.players[a], pb = team2.players[b];
          if (pa.effPos === pb.effPos) continue;
          const currDiff = Math.abs(team1.total - team2.total);
          const newT1 = team1.total - pa.ovr + pb.ovr;
          const newT2 = team2.total - pb.ovr + pa.ovr;
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

  function teamOvr(team) {
    const vals = team.map(p => p.ovr || getOverall(p)).filter(Boolean);
    return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : '—';
  }

  let html = '';

  if (isAdmin) {
    if (!editMode) {
      html += `<button class="btn btn-ghost w-full" style="margin-bottom:12px;justify-content:center;border-color:var(--gold);color:var(--gold)" onclick="state.teamsEditMode=true;renderBuiltTeams(state.builtTeams)">✏️ Editar equipos</button>`;
    } else {
      html += `<button class="btn btn-green w-full" style="margin-bottom:12px;justify-content:center" onclick="state.teamsEditMode=false;renderBuiltTeams(state.builtTeams)">✅ Confirmar equipos</button>`;
      html += `<div style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:12px;letter-spacing:.5px">MODO EDICIÓN — usá las flechas para mover jugadores entre equipos</div>`;
    }
  }

  html += `<div class="teams-container">`;

  teams.forEach((team, ti) => {
    const colorClass = teamColors[ti] || 'team-a';
    const ovr = teamOvr(team.players);
    html += `<div class="team-card">
      <div class="team-header ${colorClass}">
        <span>${teamNames[ti] || 'EQUIPO '+(ti+1)}</span>
        <span class="team-overall">OVR ${ovr} · ${team.players.length}v</span>
      </div>`;

    team.players.forEach((p, pi) => {
      const pos = p.effPos || getEffectivePosition(p);
      const ovr = p.ovr || getOverall(p) || '?';
      html += `<div class="team-player-row" style="${editMode?'padding-right:8px':''}">
        <span class="team-player-pos-badge">${pos}</span>
        <span class="team-player-name">${p.name}</span>
        <span class="team-player-ovr">${ovr}</span>`;

      if (editMode && teams.length > 1) {
        const numTeams = teams.length;
        if (numTeams === 2) {
          const toLetter = ti === 0 ? 'B' : 'A';
          html += `<button onclick="fulbitoMovePlayer(${ti},${pi},${ti===0?1:-1})" style="background:rgba(240,192,64,0.15);border:1px solid var(--gold);border-radius:6px;color:var(--gold);cursor:pointer;font-size:11px;padding:4px 8px;font-weight:700;white-space:nowrap">→ ${toLetter}</button>`;
        } else {
          html += `<div style="display:flex;gap:4px">
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
    html += `<button class="btn btn-primary w-full" style="margin-top:8px;justify-content:center" onclick="saveMatchFromTeams()">💾 Guardar partido y abrir planilla de goles</button>`;
  }

  container.innerHTML = html;
}

function fulbitoMovePlayer(fromTeamIdx, playerIdx, direction) {
  const teams = state.builtTeams;
  if (!teams) return;
  const numTeams = teams.length;
  const toTeamIdx = (fromTeamIdx + direction + numTeams) % numTeams;
  const [player] = teams[fromTeamIdx].players.splice(playerIdx, 1);
  teams[toTeamIdx].players.push(player);
  renderBuiltTeams(teams);
}

// Compartir equipos como texto (WhatsApp / clipboard)
async function shareTeams() {
  const teams = state.builtTeams;
  if (!teams || !teams.length) return;

  function teamOvr(team) {
    const vals = team.players.map(p => p.ovr || getOverall(p)).filter(Boolean);
    return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : '—';
  }

  let text = '⚽ FULBITO DEL SÁBADO ⚽\n';
  teams.forEach((t, i) => {
    text += `\n${TEAM_EMOJIS[i]||'⚪'} EQUIPO ${TEAM_NAMES[i]||i+1} (OVR ${teamOvr(t)})\n`;
    t.players.forEach(p => {
      text += `• ${p.name} (${p.effPos||'?'})${p.isGuest?' 👤':''}\n`;
    });
  });
  text += '\n¡Nos vemos en la cancha! 🔥';

  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch(e) { /* cancelado */ }
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
    const v = t.players.map(p => p.ovr || 60);
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
      <span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">🔮 Pronóstico (OVR + forma)</span>
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
