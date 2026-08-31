# Estructura del proyecto

`index.html` pasó de **5.168 líneas a 431**. Solo contiene el shell: `<head>`,
la topbar, las nav-tabs, los contenedores vacíos de cada pestaña y los `<script>`.

> **Importante:** los `.js` son **scripts clásicos**, NO ES modules.
> No agregar `type="module"` ni `import`/`export`: hay 129 `onclick=` inline en
> el HTML que necesitan que las funciones vivan en el scope global.
> El **orden de carga en `index.html` es el contrato**. No reordenar.

---

## CSS — `css/` (17 archivos)

El orden de los `<link>` reproduce la cascada original. `theme-aurora.css` pisa
reglas anteriores a propósito: si lo movés de lugar, se rompe el tema.

| Archivo | Qué contiene |
|---|---|
| `base.css` | Variables, screen system, login, selector de clubes, topbar, nav-tabs, botones |
| `inicio.css` | **Matchday Central** — hero, asistencia, resultado, fixture y acciones rápidas |
| `inicio-hero.css` | Portada de Inicio — estadio, mensaje central y disponibilidad |
| `inicio-matchcentre.css` | Centro de partido — marcador, archivo, actividad y acciones |
| `inicio-podium.css` | Podio del Inicio — tres cartas, escalas y responsive del panel |
| `jugadores.css` | Plantel, cartas del club, club house, modal de detalle |
| `asistencia.css` | Pestaña Asistencia |
| `calificar.css` | Pestaña Calificar |
| `equipos.css` | Armado de equipos |
| `partidos.css` | Historial de partidos |
| `leaderboards.css` | Pestañas Goleadores y Posiciones: podios y tablas |
| `admin.css` | Panel admin + formulario de registro |
| `goles.css` | Planilla de goles en vivo |
| `stats.css` | Stats ampliadas + paternidades |
| `utils.css` | Helpers (toast, spinners, etc.) |
| `responsive.css` | Media queries |
| `theme-aurora.css` | Glassmorphism, Aurora Stadium, Command Deck, Colección |
| `stats-matchcentre.css` | Goleadores / Match Centre |

## JS — `js/` (22 archivos)

**Núcleo** (carga primero, en este orden):

| Archivo | Qué contiene |
|---|---|
| `config.js` | Credenciales y cliente Supabase |
| `storage.js` | Capa de datos: jugadores + `fulbito_matches` |
| `state.js` | Objeto `state` global |
| `init.js` | Arranque de la app |
| `auth.js` | Login, registro, sesión |
| `navigation.js` | `switchTab()`, screens, `getMe()` |
| `support.js` | Centro de soporte |
| `ratings-normalize.js` | Normalización de votos por sesgo del votante |
| `stats-core.js` | Cálculos compartidos: goles, récord, forma, MVP |
| `render.js` | `renderAll()` — orquestador |

**Pestañas** — `js/tabs/`. Una por pestaña; acá es donde vas a trabajar:

`inicio-podium.js` · `inicio.js` · `jugadores.js` · `asistencia.js` · `calificar.js` · `equipos.js` · `goles.js` · `partidos.js` · `stats.js` · `goleadores.js` · `admin.js`

`inicio-podium.js` concentra las reglas del podio (MVP más reciente, goleador y racha sin repetir jugadores). `inicio.js` conserva el armado general de la pantalla.

`supabase-club-branding.sql` agrega la identidad compartida de cada club: nombre y escudo. Debe ejecutarse después de las migraciones de seguridad; sus RPC sólo permiten que administradores (o soporte maestro) modifiquen su propio club.

**Cierre:** `sync.js` (auto-sync + atajos de teclado) y `boot.js` (arranque final).

---

## PWA

`service-worker.js` ahora cachea los 39 archivos del shell y subió a
`fulbito-shell-v2`.

**Cada vez que agregues o renombres un `.css` o `.js`:**
1. Agregalo a `SHELL_FILES` en `service-worker.js`
2. Subí la versión (`v2` → `v3`)

Si no, la PWA sigue sirviendo el cache viejo y no vas a ver tus cambios.

---

## Verificación aplicada al split

- Los 21 `.js` parsean de forma independiente (`node --check`)
- Concatenados en orden de carga → **byte-idéntico** al JS original
- CSS idéntico ignorando líneas en blanco — 1003 reglas antes y después
- 0 colisiones de declaraciones top-level entre archivos
- Los 67 handlers `onclick` únicos resuelven a funciones definidas
