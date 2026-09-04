# Colección metálica · v64

Se conservan la grilla integrada y los registros de `renderFifaCard`. Los marcos
WebP ya existentes vuelven como capas decorativas, sin texto incrustado añadido.
`--frame-size` compensa sus distintos márgenes transparentes para que el podio
mantenga el mismo tamaño visible. Los números de cuatro cifras ajustan su fuente,
no el ancho de la tarjeta ni sus valores.

## Referencias visuales

- [EA: diferencias visuales entre ediciones de cartas](https://www.ea.com/able/news/explaining-rarity-in-fifa-ultimate-team).
- [Simon Goellner: tarjetas con efectos holográficos](https://github.com/simeydotme/pokemon-cards-css).
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).

Las referencias orientaron textura, reflejos y comportamiento. No se copiaron
código, librerías ni imágenes de esos proyectos. Se reutilizan los marcos locales.

## Movimiento y pruebas

- Brillo de entrada de 1,8 segundos, una sola pasada; no hay bucles continuos.
- Inclinación máxima de 3 grados con mouse/lápiz y puntero fino. No intercepta
  clics, teclado ni desplazamiento táctil. Miniaturas e históricos no se inclinan.
- Movimiento reducido desactiva tanto la animación CSS como la interacción JS.
- `js/card-effects.js` actualiza únicamente la tarjeta activa mediante rAF,
  cancela al salir y limpia al reemplazar el DOM. No modifica estadísticas.
- `tests/card-effects.test.js`: política de entrada, limpieza, rendimiento y media queries.
- `tests/player-stats-browser-harness.html`: marco, geometría, cifras grandes,
  variantes, igualdad de datos, navegación a perfiles y efectos reales de CSS.
- Las páginas `player-stats-mobile-320-frame.html`, `player-stats-mobile-frame.html`
  y `player-stats-compact-frame.html` fijan 320, 390 y 520 px respectivamente.
