// GOLES — planilla en vivo (cualquiera puede anotar)
// ============================================================
let golesMatchId = null;
let _goalSaveTimer = null;
let _goalSavePending = null;
let _goalWriteQueue = Promise.resolve();
let _goalWritesPending = 0;

function openGolesFor(id) {
  golesMatchId = id;
  switchTab('goles');
}

async function refreshGoles() {
  matches = await loadMatches();
  renderGoles();
  showToast('🔄 Planilla actualizada');
}

function getActiveMatchId() {
  if (golesMatchId && matches.find(m => m.id === golesMatchId)) return golesMatchId;
  const abierto = matches.find(m => !isPlayed(m));
  return (abierto || matches[0] || {}).id || null;
}

function setSaveState(txt) {
  const el = document.getElementById('goles-save-state');
  if (el) el.textContent = txt;
}

function addGoal(mid, key, delta) {
  const m = matches.find(x => x.id === mid);
  if (!m) return;
  if (!m.result) m.result = { winner: null, margin: null, mvp: null, goals: {}, goalsTracked: true };
  if (!m.result.goals) m.result.goals = {};
  m.result.goalsTracked = true;
  const next = Math.max(0, (m.result.goals[key] || 0) + delta);
  if (next === 0) delete m.result.goals[key];
  else m.result.goals[key] = next;
  paintGoals(m, key);
  queueGoalWrite(mid, key, delta);
  if (delta > 0 && navigator.vibrate) navigator.vibrate(25);
}

// Cada toque viaja como una variación atómica al servidor: no se reemplaza el
// partido entero (operación reservada a admins) y dos celulares no se pisan.
function queueGoalWrite(mid, key, delta) {
  _goalWritesPending++;
  setSaveState('✍️ Guardando…');
  _goalWriteQueue = _goalWriteQueue
    .then(async () => {
      await callRpc('fulbito_record_goal', {
        p_club_id: state.currentClub.id,
        p_match_id: mid,
        p_goal_key: key,
        p_delta: delta
      });
    })
    .catch(async (error) => {
      console.error('record goal:', error);
      // Se vuelve a la versión protegida del servidor para no dejar un marcador
      // optimista incorrecto cuando falla la conexión o el permiso.
      matches = await loadMatches();
      renderGoles();
      showToast(`❌ ${error.message || 'No se pudo guardar el gol'}`, 3600);
    })
    .finally(async () => {
      _goalWritesPending--;
      if (_goalWritesPending === 0) {
        _goalSaveTimer = setTimeout(async () => {
          _goalSaveTimer = null;
          const freshMatches = await loadMatches();
          if (freshMatches.length || !matches.length) matches = freshMatches;
          renderGoles();
          setSaveState('✅ Guardado');
          setTimeout(() => setSaveState(''), 1600);
        }, 100);
      }
    });
}

function paintGoals(m, animKey) {
  const g = getGoals(m);
  (m.teams || []).forEach((t, i) => {
    const tot = teamGoals(m, i);
    const board = document.getElementById('gt-' + i);
    if (board) board.textContent = tot;
    const head = document.getElementById('gth-' + i);
    if (head) head.textContent = tot + (tot === 1 ? ' gol' : ' goles');
    [...(t.players || []).map(p => p.id), '__t' + i].forEach(k => {
      const c = document.getElementById('gc-' + k);
      if (!c) return;
      const n = g[k] || 0;
      c.textContent = n;
      c.classList.toggle('zero', n === 0);
      const row = c.closest('.goal-row');
      if (row) row.classList.toggle('scored', n > 0);
      if (k === animKey) {
        c.classList.remove('pop');
        void c.offsetWidth;
        c.classList.add('pop');
      }
    });
  });
}

function renderGoles() {
  const el = document.getElementById('goles-content');
  if (!el) return;

  if (!matches.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚽</div>
      <div>Todavía no hay ningún partido guardado.</div>
      <div style="font-size:12px;margin-top:6px">Armá los equipos en 🏆 Equipos y guardá el partido para abrir la planilla.</div>
    </div>`;
    return;
  }

  const mid = getActiveMatchId();
  const m = matches.find(x => x.id === mid);
  if (!m) { el.innerHTML = `<div class="empty-state">Elegí un partido</div>`; return; }

  const isAdmin = state.currentUser && state.currentUser.isAdmin;
  const teams = m.teams || [];
  const g = getGoals(m);

  // Selector de partido
  const opts = matches.slice(0, 12).map(mm => {
    const estado = isPlayed(mm) ? 'cerrado' : 'abierto';
    const marcador = matchHasGoals(mm) ? ' · ' + matchScoreStr(mm) : '';
    return `<option value="${mm.id}"${mm.id === mid ? ' selected' : ''}>${formatMatchDate(mm)} · ${estado}${marcador}</option>`;
  }).join('');

  let html = `<select class="goles-select" onchange="golesMatchId=this.value;renderGoles()">${opts}</select>`;

  // Marcador
  html += `<div class="score-board">`;
  teams.forEach((t, i) => {
    if (i > 0) html += `<div class="score-sep">–</div>`;
    html += `<div class="score-side">
      <div class="sname sc${i}">${TEAM_EMOJIS[i] || '⚪'} ${TEAM_NAMES[i]}</div>
      <div class="snum sc${i}" id="gt-${i}">${teamGoals(m, i)}</div>
    </div>`;
  });
  html += `</div>`;
  html += `<div class="save-state" id="goles-save-state"></div>`;

  if (isPlayed(m)) {
    const res = m.result;
    const txt = res.winner === 'draw' ? '🤝 Partido cerrado como empate' : `🏆 Partido cerrado — ganó Equipo ${TEAM_NAMES[res.winner]}`;
    html += `<div style="background:rgba(240,192,64,.08);border:1px solid rgba(240,192,64,.35);border-radius:10px;padding:9px 12px;font-size:12px;color:var(--gold);margin-bottom:12px;line-height:1.5">${txt}. Podés seguir corrigiendo goles igual.</div>`;
  }

  // Planillas por equipo
  teams.forEach((t, i) => {
    const tot = teamGoals(m, i);
    html += `<div class="goal-team">
      <div class="team-header ${TEAM_CLASSES[i] || 'team-a'}">
        <span>${TEAM_EMOJIS[i] || '⚪'} EQUIPO ${TEAM_NAMES[i]}</span>
        <span class="team-overall" id="gth-${i}">${tot} ${tot === 1 ? 'gol' : 'goles'}</span>
      </div>`;
    (t.players || []).forEach(p => {
      html += goalRowHTML(m.id, p.id, `${p.name}${p.isGuest ? ' 👤' : ''}`, g[p.id] || 0, false);
    });
    html += goalRowHTML(m.id, '__t' + i, '⚪ Sin autor / en contra', g['__t' + i] || 0, true);
    html += `</div>`;
  });

  html += `<button class="btn btn-ghost w-full" style="justify-content:center;margin-top:4px" onclick="shareMatchResult('${m.id}')">📲 Compartir marcador</button>`;

  if (isAdmin) {
    if (matchHasGoals(m)) {
      html += `<button class="btn btn-primary w-full" style="justify-content:center;margin-top:8px" onclick="closeMatchFromGoals('${m.id}')">🏁 ${isPlayed(m) ? 'Recalcular resultado con este marcador' : 'Cerrar partido con este marcador'}</button>`;
    }
    html += `<button class="btn btn-danger w-full" style="justify-content:center;margin-top:8px" onclick="resetGoals('${m.id}')">♻️ Reiniciar goles</button>`;
  }

  html += `<div class="goal-hint">Cualquiera puede anotar desde su celular: se sincroniza en vivo con el resto.<br>Si nadie sabe quién la metió, usá <b>Sin autor / en contra</b> para que el marcador cierre.</div>`;

  el.innerHTML = html;
}

function goalRowHTML(mid, key, name, n, extra) {
  return `<div class="goal-row${extra ? ' extra' : ''}${n > 0 ? ' scored' : ''}">
    <span class="goal-name">${name}</span>
    <span class="goal-count${n ? '' : ' zero'}" id="gc-${key}">${n}</span>
    <button class="goal-btn minus" onclick="addGoal('${mid}','${key}',-1)" aria-label="Restar gol a ${name}">−</button>
    <button class="goal-btn plus" onclick="addGoal('${mid}','${key}',1)" aria-label="Sumar gol a ${name}">+</button>
  </div>`;
}

async function closeMatchFromGoals(mid) {
  const m = matches.find(x => x.id === mid);
  if (!m) return;
  const sc = matchScore(m);
  const max = Math.max(...sc);
  const ganadores = sc.filter(s => s === max).length;
  const ordenados = [...sc].sort((a, b) => b - a);

  let winner, margin = null;
  if (ganadores > 1) { winner = 'draw'; }
  else {
    winner = sc.indexOf(max);
    margin = Math.min(3, Math.max(1, max - ordenados[1]));
  }

  // MVP sugerido: máximo goleador del equipo ganador (o del partido si fue empate)
  const scorers = matchScorers(m);
  const delGanador = winner === 'draw'
    ? scorers
    : scorers.filter(s => ((m.teams||[])[winner].players||[]).some(p => p.id === s.id));
  const mvpSugerido = (m.result && m.result.mvp) || (delGanador[0] ? delGanador[0].id : null);

  const resumen = winner === 'draw'
    ? `Empate ${sc.join('–')}`
    : `Gana Equipo ${TEAM_NAMES[winner]} ${sc.join('–')} (${marginLabel(margin)})`;
  const mvpTxt = mvpSugerido ? `\nMVP: ${playerNameById(mvpSugerido)}` : '';
  if (!confirm(`¿Cerrar el partido con este marcador?\n\n${resumen}${mvpTxt}`)) return;

  m.result = {
    winner,
    margin,
    mvp: mvpSugerido,
    goals: getGoals(m),
    goalsTracked: true
  };
  await upsertMatch(m);
  renderHub();
  renderGoles();
  renderPlayers();
  showToast('🏁 Partido cerrado');
}

async function resetGoals(mid) {
  const m = matches.find(x => x.id === mid);
  if (!m) return;
  if (!confirm('¿Borrar todos los goles de este partido?')) return;
  if (isPlayed(m)) {
    m.result.goals = {};
    m.result.goalsTracked = true;
  } else {
    m.result = { winner: null, margin: null, mvp: null, goals: {}, goalsTracked: true };
  }
  await upsertMatch(m);
  renderHub();
  renderGoles();
  renderPlayers();
  showToast('♻️ Goles reiniciados');
}

// ============================================================
