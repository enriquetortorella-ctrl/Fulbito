/* ===== CARTAS DEL CLUB — escudo por tier =============================
   Se carga DESPUÉS de theme-aurora.css para ganarle al override
   #tab-jugadores, que tapaba los tiers con un lavado gris.

   El bug anterior era posicionamiento absoluto: la foto flotaba encima
   del nombre. Acá TODO vive en una grilla de filas fijas, así que
   ningún bloque puede pisar a otro. La foto ocupa su celda y nada más.
   ==================================================================== */

.fifa-card,
#tab-jugadores .fifa-card,
.podium-slot .fifa-card{
  position:relative;width:100%;max-width:250px;justify-self:center;
  aspect-ratio:.667;min-height:0;cursor:pointer;overflow:visible;
  clip-path:none;border:0;border-radius:0;box-shadow:none;filter:none;
  background:url('../assets/cards/gold.webp') center/contain no-repeat;
  padding:0;

  container-type:inline-size;

  display:grid;
  grid-template-columns:44% 56%;
  /* 13% cabecera · 40% foto+datos · nombre · stats · resto para la punta */
  /* alineado a las líneas que trae dibujadas el escudo: 53%, 62% y 85% */
  grid-template-rows:15% 38% 10% 22% 1fr;
  align-items:stretch;
  transition:transform .26s cubic-bezier(.16,1,.3,1);
}
.fifa-card:hover,#tab-jugadores .fifa-card:hover{transform:translateY(-7px)}

/* El tier elige el escudo */
.fifa-card.gold,#tab-jugadores .fifa-card.gold{background-image:url('../assets/cards/gold.webp')}
.fifa-card.silver,#tab-jugadores .fifa-card.silver{background-image:url('../assets/cards/silver.webp')}
.fifa-card.bronze,#tab-jugadores .fifa-card.bronze{background-image:url('../assets/cards/bronze.webp')}
.fifa-card.rare,#tab-jugadores .fifa-card.rare{background-image:url('../assets/cards/icon.webp')}
/* Prioridad de fondo, de menor a mayor: racha < goleador < MVP.
   Misma especificidad, así que manda el ORDEN de estas tres líneas. */
.fifa-card.card-hot,#tab-jugadores .fifa-card.card-hot{background-image:url('../assets/cards/hot.webp')}
.fifa-card.card-top-scorer,#tab-jugadores .fifa-card.card-top-scorer{background-image:url('../assets/cards/scorer.webp')}
.fifa-card.card-mvp,#tab-jugadores .fifa-card.card-mvp{background-image:url('../assets/cards/mvp.webp')}

/* El escudo ya trae su propio relieve: fuera las capas viejas */
.fifa-card::before,#tab-jugadores .fifa-card::before,
.fifa-card::after,#tab-jugadores .fifa-card::after{content:none}
.fifa-shine{display:none}

/* --- Fila 2, izquierda: OVR, tier, posición --- */
.fifa-top{
  grid-column:1;grid-row:2;display:flex;flex-direction:column;
  justify-content:space-between;align-items:stretch;
  padding:4% 3% 4% 30%;min-width:0;   /* 33% de la columna = ~14.5% de la carta */
}
.fifa-left{display:block;text-align:left}
.fifa-card-overall{font-family:'Bebas Neue',sans-serif;font-size:17cqw;line-height:.85;color:#1c1305}
.fifa-card-pos{font-family:'Bebas Neue',sans-serif;font-size:7.4cqw;letter-spacing:.05em;color:#1c1305;margin-top:1.6cqw;padding-top:1.6cqw;border-top:1px solid rgba(0,0,0,.3);display:inline-block;min-width:34px}
.fifa-card-tier{font-size:4.7cqw;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#3a2a0c;margin-top:1.2cqw;opacity:.85}

/* --- Fila 2, derecha: la foto, enmarcada, dentro de su celda --- */
.fifa-card-portrait{
  grid-column:2;grid-row:2;position:relative;
  /* anular la geometría absoluta de jugadores.css */
  left:auto;right:auto;top:auto;bottom:auto;width:auto;height:auto;
  clip-path:none;z-index:auto;pointer-events:auto;opacity:1;
  margin:0 18% 0 6%;border-radius:8px;overflow:hidden;
  background:rgba(0,0,0,.28);
  box-shadow:0 0 0 1px rgba(0,0,0,.45),0 0 0 3px rgba(255,255,255,.42),
             0 0 0 4px rgba(0,0,0,.28),0 6px 14px rgba(0,0,0,.4);
  mask-image:none;-webkit-mask-image:none;filter:none;
}
.fifa-card-portrait img{width:100%;height:100%;object-fit:cover;object-position:center 20%;display:block}
.fifa-card-portrait::after{content:none}
/* Sin foto no hay marco vacío: se ve el escudo, como en las cartas de referencia */
.fifa-card-portrait.is-placeholder{background:none;box-shadow:none;font-size:0}

/* --- Nombre y stats: ancho completo, cada uno en su fila --- */
.fifa-divider{grid-column:1/-1;grid-row:3;height:1px;margin:0 13%;background:rgba(0,0,0,.28);align-self:start}
.fifa-card-name{
  grid-column:1/-1;grid-row:3;align-self:center;
  font-family:'Bebas Neue',sans-serif;font-size:8cqw;
  letter-spacing:.07em;line-height:1;color:#1c1305;text-align:center;
  padding:0 11%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.fifa-card-stats{
  grid-column:1/-1;grid-row:4;position:relative;
  display:grid;grid-template-columns:1fr 1fr;gap:1px 0;
  width:auto;margin:0;padding:0 15% 0 9%;align-content:center;
}
.fifa-card-stats::before{content:'';position:absolute;left:50%;top:1px;bottom:1px;width:1px;background:rgba(0,0,0,.24)}
.fifa-card-stat{
  display:flex;align-items:baseline;justify-content:center;gap:1.8cqw;
  font-size:4.1cqw;font-weight:800;color:#2a1d06;line-height:1.42;border-radius:0;
}
.fifa-card-stat span:first-child{font-family:'Bebas Neue',sans-serif;font-size:7cqw;color:#140d02;min-width:2.4em;text-align:right}
.fifa-card-stat.best,.fifa-card.rare .fifa-card-stat.best,
.fifa-card.card-mvp .fifa-card-stat.best,
.fifa-card.card-top-scorer .fifa-card-stat.best{background:none}
.fifa-card-stat.best span:first-child{color:#000;font-size:7.4cqw}

/* --- Récord y distintivos: fila baja, lejos de la punta --- */
.fifa-card-record{
  align-self:stretch;margin:0;padding:1cqw 2cqw;border-radius:5px;
  background:rgba(0,0,0,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.16);
  font-size:3.5cqw;font-weight:700;color:#1c1305;text-align:center;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
/* El escudo ya identifica MVP, goleador y racha, y el récord muestra ⭐ y ⚽.
   Las chapas de texto se pisaban con el ornamento de la corona. */
.card-spotlights{display:none}
.fifa-card.has-card-spotlight{padding-bottom:0}

/* --- Color de texto: sigue EXACTAMENTE el mismo orden de prioridad que
   los fondos (racha < goleador < MVP), para que texto y escudo nunca
   se desincronicen. Decidido por luminancia medida de cada escudo. --- */
.fifa-card.bronze .fifa-card-overall,
.fifa-card.bronze .fifa-card-pos,
.fifa-card.bronze .fifa-card-name,
.fifa-card.bronze .fifa-card-stat,
.fifa-card.bronze .fifa-card-record{color:#f8f5ff;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.fifa-card.bronze .fifa-card-stat span:first-child{color:#fff}
.fifa-card.bronze .fifa-card-tier{color:rgba(255,255,255,.78)}
.fifa-card.bronze .fifa-divider,.fifa-card.bronze .fifa-card-stats::before{background:rgba(255,255,255,.34)}
.fifa-card.bronze .fifa-card-pos{border-top-color:rgba(255,255,255,.34)}
.fifa-card.bronze .fifa-card-record{background:rgba(0,0,0,.38)}

.fifa-card.rare .fifa-card-overall,
.fifa-card.rare .fifa-card-pos,
.fifa-card.rare .fifa-card-name,
.fifa-card.rare .fifa-card-stat,
.fifa-card.rare .fifa-card-record{color:#f8f5ff;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.fifa-card.rare .fifa-card-stat span:first-child{color:#fff}
.fifa-card.rare .fifa-card-tier{color:rgba(255,255,255,.78)}
.fifa-card.rare .fifa-divider,.fifa-card.rare .fifa-card-stats::before{background:rgba(255,255,255,.34)}
.fifa-card.rare .fifa-card-pos{border-top-color:rgba(255,255,255,.34)}
.fifa-card.rare .fifa-card-record{background:rgba(0,0,0,.38)}

.fifa-card.card-hot .fifa-card-overall,
.fifa-card.card-hot .fifa-card-pos,
.fifa-card.card-hot .fifa-card-name,
.fifa-card.card-hot .fifa-card-stat,
.fifa-card.card-hot .fifa-card-record{color:#1c1305;text-shadow:0 1px 0 rgba(255,255,255,.28)}
.fifa-card.card-hot .fifa-card-stat span:first-child{color:#140d02}
.fifa-card.card-hot .fifa-card-tier{color:#3a2a0c}
.fifa-card.card-hot .fifa-divider,.fifa-card.card-hot .fifa-card-stats::before{background:rgba(0,0,0,.3)}
.fifa-card.card-hot .fifa-card-pos{border-top-color:rgba(0,0,0,.3)}
.fifa-card.card-hot .fifa-card-record{background:rgba(0,0,0,.16)}

.fifa-card.card-top-scorer .fifa-card-overall,
.fifa-card.card-top-scorer .fifa-card-pos,
.fifa-card.card-top-scorer .fifa-card-name,
.fifa-card.card-top-scorer .fifa-card-stat,
.fifa-card.card-top-scorer .fifa-card-record{color:#f8f5ff;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.fifa-card.card-top-scorer .fifa-card-stat span:first-child{color:#fff}
.fifa-card.card-top-scorer .fifa-card-tier{color:rgba(255,255,255,.78)}
.fifa-card.card-top-scorer .fifa-divider,.fifa-card.card-top-scorer .fifa-card-stats::before{background:rgba(255,255,255,.34)}
.fifa-card.card-top-scorer .fifa-card-pos{border-top-color:rgba(255,255,255,.34)}
.fifa-card.card-top-scorer .fifa-card-record{background:rgba(0,0,0,.38)}

.fifa-card.card-mvp .fifa-card-overall,
.fifa-card.card-mvp .fifa-card-pos,
.fifa-card.card-mvp .fifa-card-name,
.fifa-card.card-mvp .fifa-card-stat,
.fifa-card.card-mvp .fifa-card-record{color:#1c1305;text-shadow:0 1px 0 rgba(255,255,255,.28)}
.fifa-card.card-mvp .fifa-card-stat span:first-child{color:#140d02}
.fifa-card.card-mvp .fifa-card-tier{color:#3a2a0c}
.fifa-card.card-mvp .fifa-divider,.fifa-card.card-mvp .fifa-card-stats::before{background:rgba(0,0,0,.3)}
.fifa-card.card-mvp .fifa-card-pos{border-top-color:rgba(0,0,0,.3)}
.fifa-card.card-mvp .fifa-card-record{background:rgba(0,0,0,.16)}

.fifa-card-stat.best{background:none}

@media (max-width:640px){
  #tab-jugadores .fifa-card,.fifa-card{max-width:none}
  .fifa-top{padding-left:28%}
  .fifa-card-portrait{margin-right:16%}
}
@media (prefers-reduced-motion:reduce){
  .fifa-card,.fifa-card:hover,#tab-jugadores .fifa-card:hover{transition:none;transform:none}
}

/* Si el jugadores.js viejo todavía está cacheado, el récord y las medallas
   llegan como hijos directos de la carta. Sin posición explícita se
   autocolocaban en la corona. Estas dos reglas los mantienen en su lugar
   hasta que el JS nuevo se propague. */
.fifa-card > .fifa-card-record{
  grid-column:1;grid-row:2;align-self:end;justify-self:start;
  margin:0 0 13cqw 27%;width:auto}
.fifa-card > .fifa-card-medals{
  grid-column:1;grid-row:2;align-self:end;justify-self:start;margin:0 0 4% 27%;padding:0}

.fifa-meta{display:flex;flex-direction:column;align-items:flex-start;gap:1.6cqw;width:100%}

/* ===== MEDALLAS — MVPs y goles ======================================
   Antes iban dentro de la franja de récord y se salían por la punta.
   Ahora viven en la columna izquierda, debajo del OVR, donde el
   escudo es ancho. Cada una es un disco con su número.
   ==================================================================== */
.fifa-card-medals{
  display:flex;gap:2cqw;padding:0;position:relative;z-index:3;
}
.fifa-medal{
  display:inline-flex;align-items:center;justify-content:center;gap:.8cqw;
  min-width:11cqw;height:8.6cqw;padding:0 1.6cqw;border-radius:99px;
  background:rgba(0,0,0,.34);box-shadow:inset 0 0 0 1px rgba(255,255,255,.3);
  line-height:1;
}
.fifa-medal i{font-style:normal;font-size:5cqw}
.fifa-medal b{font-family:'Bebas Neue',sans-serif;font-size:6cqw;color:#fff}
.fifa-medal.is-mvp{background:rgba(120,84,0,.5)}
.fifa-medal.is-mvp i{color:#ffd257}
.fifa-medal.is-goal{background:rgba(0,0,0,.4)}
/* sobre escudos claros el disco se invierte para no perder contraste */
.fifa-card.silver .fifa-medal,.fifa-card.gold .fifa-medal,
.fifa-card.card-hot .fifa-medal,.fifa-card.card-mvp .fifa-medal{
  background:rgba(255,255,255,.5);box-shadow:inset 0 0 0 1px rgba(0,0,0,.26)}
.fifa-card.silver .fifa-medal b,.fifa-card.gold .fifa-medal b,
.fifa-card.card-hot .fifa-medal b,.fifa-card.card-mvp .fifa-medal b{color:#14100a}
.fifa-card.card-hot .fifa-medal.is-mvp,.fifa-card.card-mvp .fifa-medal.is-mvp,
.fifa-card.silver .fifa-medal.is-mvp,.fifa-card.gold .fifa-medal.is-mvp{background:rgba(255,205,80,.55)}


/* ===== LEYENDA DE MARCOS =============================================
   Cada muestra usa el mismo archivo que el escudo real, recortado a su
   parte central, así nunca se desincroniza del diseño de las cartas.
   ==================================================================== */
.frame-legend{margin:0 0 14px;border:1px solid var(--border);border-radius:12px;background:var(--bg2);overflow:hidden}
.frame-legend summary{cursor:pointer;padding:11px 15px;font-size:12px;font-weight:800;letter-spacing:.4px;color:var(--muted);list-style:none;user-select:none}
.frame-legend summary::-webkit-details-marker{display:none}
.frame-legend summary::after{content:'▾';float:right;transition:transform .2s}
.frame-legend[open] summary::after{transform:rotate(180deg)}
.frame-legend summary:hover{color:var(--text)}
.frame-legend-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:8px 16px;padding:4px 15px 12px}
.frame-key{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--text)}
.frame-key i{
  flex-shrink:0;width:20px;height:27px;border-radius:4px;
  background-size:150% 150%;background-position:center 38%;
  box-shadow:0 0 0 1px rgba(255,255,255,.16),0 2px 5px rgba(0,0,0,.4);
}
.frame-key i[data-frame="gold"]{background-image:url('../assets/cards/gold.webp')}
.frame-key i[data-frame="silver"]{background-image:url('../assets/cards/silver.webp')}
.frame-key i[data-frame="bronze"]{background-image:url('../assets/cards/bronze.webp')}
.frame-key i[data-frame="icon"]{background-image:url('../assets/cards/icon.webp')}
.frame-key i[data-frame="mvp"]{background-image:url('../assets/cards/mvp.webp')}
.frame-key i[data-frame="scorer"]{background-image:url('../assets/cards/scorer.webp')}
.frame-key i[data-frame="hot"]{background-image:url('../assets/cards/hot.webp')}
.frame-legend-note{padding:0 15px 13px;font-size:11px;color:var(--muted);line-height:1.45}
/* la etiqueta del marco puede ser larga: que no rompa la columna */
/* tope duro: una etiqueta larga se recorta, nunca invade la foto */
.fifa-card .fifa-card-tier{white-space:nowrap;letter-spacing:.05em;font-size:4.7cqw;
  max-width:100%;overflow:hidden;text-overflow:ellipsis}
.fifa-card .fifa-left{width:100%;max-width:100%;overflow:hidden;text-align:left}

/* ===== ANULACIÓN DE GEOMETRÍA HEREDADA ==============================
   jugadores.css fija width, max-width, position, inset y márgenes sobre
   estos elementos. CSS solo pisa las propiedades que uno declara, así que
   las que no nombraba seguían vivas (por eso el nombre quedaba centrado
   en 46%: heredaba max-width:92%). Este bloque las neutraliza de raíz.
   ==================================================================== */
.fifa-card .fifa-top,.fifa-card .fifa-left,.fifa-card .fifa-divider,
.fifa-card .fifa-card-name,.fifa-card .fifa-card-stats,
.fifa-card .fifa-card-record,.fifa-card .fifa-card-medals,.fifa-card .fifa-meta{
  max-width:none;min-width:0;position:relative;
  left:auto;right:auto;top:auto;bottom:auto;inset:auto;float:none;
}
.fifa-card .fifa-card-name{width:auto;justify-self:stretch}
.fifa-card .fifa-divider{width:auto}
.fifa-card .fifa-top{width:auto;margin:0}
.fifa-card .fifa-card-stats{width:auto;margin:0}
.fifa-card .fifa-shine,.fifa-card .fifa-card-photo{display:none}
.fifa-card .fifa-card-portrait.is-placeholder{padding:0}
.fifa-card .fifa-card-portrait img{transform:none}
.frame-key b{font-weight:800;letter-spacing:.04em}
