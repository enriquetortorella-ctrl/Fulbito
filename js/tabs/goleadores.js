// GOLEADORES — ranking ofensivo en pestaña independiente
// ============================================================
let scorersPeriod = 'all';

function setScorersPeriod(period) {
  scorersPeriod = period;
  renderGoleadoresTab();
}

function scorerPeriodMatches() {
  const played = matches.filter(isPlayed).slice().sort((a,b) =>
    (b.match_date || '').localeCompare(a.match_date || '') ||
    (b.created_at || '').localeCompare(a.created_at || '')
  );
  if (scorersPeriod === 'all') return played;
  if (scorersPeriod === 'last10') return played.slice(0, 10);
  return played.filter(match => (match.match_date || '').slice(0,4) === scorersPeriod);
}

function leaderboardHighlights(entries, scope) {
  const rows = entries || state.players.map(p => ({ p, rec: getPlayerRecord(p.id) }));
  return getCardHighlights(rows, scope);
}

function leaderboardCard(item, rank, title, primary, primaryLabel, secondary, highlights, tone = '') {
  if (!item) return '';
  const card = typeof renderFifaCard === 'function'
    ? renderFifaCard(item.p, highlights, 'podium', item)
    : `<div class="leaderboard-card-fallback">${escapeHtml(item.p.name)}</div>`;
  return `<article class="leaderboard-feature ${tone}">
    <div class="leaderboard-rank-label">${rank} · ${title}</div>
    <div class="leaderboard-card-visual">${card}</div>
    <div class="leaderboard-feature-name">${escapeHtml(item.p.name)}</div>
    <div class="leaderboard-feature-metric"><b>${primary}</b><span>${primaryLabel}</span></div>
    <div class="leaderboard-feature-sub">${secondary}</div>
  </article>`;
}

function renderGoleadoresTab() {
  const el = document.getElementById('goleadores-content');
  if (!el) return;
  const allPlayed = matches.filter(isPlayed);
  const years = [...new Set(allPlayed.map(m => (m.match_date || '').slice(0,4)).filter(Boolean))].sort().reverse();
  if (scorersPeriod !== 'all' && scorersPeriod !== 'last10' && !years.includes(scorersPeriod)) scorersPeriod = 'all';
  const periodButtons = `<div class="period-bar leaderboard-periods">
    <button class="btn btn-sm ${scorersPeriod === 'all' ? 'btn-primary' : 'btn-ghost'}" onclick="setScorersPeriod('all')">🏛️ Histórico</button>
    ${allPlayed.length > 10 ? `<button class="btn btn-sm ${scorersPeriod === 'last10' ? 'btn-primary' : 'btn-ghost'}" onclick="setScorersPeriod('last10')">🔟 Últimos 10</button>` : ''}
    ${years.length > 1 ? years.map(year => `<button class="btn btn-sm ${scorersPeriod === year ? 'btn-primary' : 'btn-ghost'}" onclick="setScorersPeriod('${year}')">${year}</button>`).join('') : ''}
  </div>`;
  const scope = scorerPeriodMatches();
  const tracked = goalTrackedMatches(scope);
  const totalGoals = tracked.reduce((sum, match) => sum + matchTotalGoals(match), 0);
  const rows = statsPlayers(scope).filter(row => row.goals > 0)
    .sort((a,b) => b.goals - a.goals || goalsPerGame(b) - goalsPerGame(a) || a.p.name.localeCompare(b.p.name));

  if (!tracked.length || !rows.length) {
    el.innerHTML = `${periodButtons}<div class="empty-state"><div class="empty-state-icon">🥇</div><div>Todavía no hay goleadores para este período.</div><div style="font-size:12px;margin-top:6px">Los datos aparecen desde el primer partido con planilla de goles registrada.</div></div>`;
    return;
  }

  const highlights = leaderboardHighlights(rows, scope);
  const leader = rows[0];
  const runner = rows[1] || null;
  const rest = rows.slice(2);
  const share = row => Math.round(row.goals / Math.max(1, totalGoals) * 100);
  const cardRows = rest.map((row, index) => `<article class="leaderboard-list-card" onclick="openPlayerProfile('${row.p.id}')">
    <div class="leaderboard-list-rank">${index + 3}</div>
    <div class="leaderboard-list-card-visual">${typeof renderFifaCard === 'function' ? renderFifaCard(row.p, highlights, 'thumbnail', row) : ''}</div>
    <div class="leaderboard-list-copy"><b>${escapeHtml(row.p.name)}</b><span>${row.goalPj} PJ con planilla · ${share(row)}% de los goles</span></div>
    <div class="leaderboard-list-metrics"><strong>${row.goals}</strong><span>GOLES</span><b>${goalsPerGame(row).toFixed(2)} G/PJ</b></div>
  </article>`).join('');

  el.innerHTML = `${periodButtons}
    <section class="leaderboard-page scorer-page">
      <header class="leaderboard-page-head"><div><span>RANKING OFENSIVO</span><h2>GOLEADORES</h2><p>${tracked.length} partidos con planilla · ${totalGoals} goles registrados</p></div><div class="leaderboard-page-total"><b>${leader.goals}</b><span>Goles del líder</span></div></header>
      <div class="leaderboard-podium scorer-podium">
        ${leaderboardCard(leader, '1°', 'MÁXIMO GOLEADOR', leader.goals, 'GOLES', `${goalsPerGame(leader).toFixed(2)} G/PJ · ${leader.goalPj} PJ REG.`, highlights, 'is-champion')}
        ${runner ? leaderboardCard(runner, '2°', 'SEGUNDO GOLEADOR', runner.goals, 'GOLES', `${goalsPerGame(runner).toFixed(2)} G/PJ · ${runner.goalPj} PJ REG.`, highlights, 'is-runner') : ''}
      </div>
      ${rest.length ? `<div class="leaderboard-list-title"><span>Resto del ranking</span><b>${rest.length} jugador${rest.length === 1 ? '' : 'es'}</b></div><div class="leaderboard-list-grid">${cardRows}</div>` : ''}
      <p class="leaderboard-note">El promedio se calcula únicamente con los partidos donde existe planilla de goles. Los partidos anteriores no alteran G/PJ.</p>
    </section>`;
}
