// PODIO DEL CLUB — reglas de selección y render de cartas del Inicio.
// Se mantiene separado del layout para poder rediseñarlo sin tocar resultados.
function getHubPodium(rows, played) {
  const highlights = typeof getCardHighlights === 'function'
    ? getCardHighlights(rows, played)
    : { topScorerIds: new Set(), latestMvpId: null, forms: new Map() };
  const latestMvpMatch = played.find(m => m.result?.mvp) || null;
  const latestMvp = latestMvpMatch
    ? rows.find(x => x.p.id === latestMvpMatch.result.mvp) || null
    : rows.slice().filter(x => x.rec.mvps > 0).sort((a,b) => b.rec.mvps - a.rec.mvps || b.ovr - a.ovr)[0] || null;
  const used = new Set(latestMvp?.p?.id ? [latestMvp.p.id] : []);
  const scorer = rows.slice()
    .filter(x => x.rec.goals > 0 && !used.has(x.p.id))
    .sort((a,b) => b.rec.goals - a.rec.goals || b.rec.goalPj - a.rec.goalPj || a.p.name.localeCompare(b.p.name))[0] || null;
  if (scorer?.p?.id) used.add(scorer.p.id);
  const streakRows = rows.map(x => ({ ...x, streak: getMaxWinStreak(x.p.id) }));
  const streak = streakRows
    .filter(x => x.streak > 0 && !used.has(x.p.id))
    .sort((a,b) => b.streak - a.streak || b.rec.w - a.rec.w || b.rec.mvps - a.rec.mvps)[0]
    || rows.slice().filter(x => x.rec.mvps > 0 && !used.has(x.p.id)).sort((a,b) => b.rec.mvps - a.rec.mvps)[0]
    || null;
  return { highlights, latestMvp, scorer, streak };
}

function hubLiveCard(label, item, value, unit, tone, highlights) {
  if (!item?.p || typeof renderFifaCard !== 'function') {
    return hubPodiumCard(label, item, value, unit);
  }
  return `<article class="hub-live-card ${tone}">
    <div class="hub-live-card-label">${label}</div>
    <div class="hub-live-card-frame">${renderFifaCard(item.p, highlights, 'podium', item.rec || item)}</div>
    <div class="hub-live-card-metric"><b>${value}</b><span>${unit}</span></div>
  </article>`;
}
