# ♞ Chess Coach: entrenamiento de nivel GM

Una app para entrenar ajedrez en serio: repertorios de aperturas para 1.e4 y 1.d4, patrones de medio juego, técnica de finales y un **modo Repaso** con repetición espaciada para que las jugadas correctas se vuelvan automáticas. En **español** por defecto, con versión en **inglés** (botón ES / EN).

**Úsala aquí:** https://emicharev-cell.github.io/chess-coach/

*English: a GM-level chess trainer with opening repertoires, middlegame patterns, endgame technique and a spaced-repetition Drill mode. Spanish by default; switch to English with the ES / EN button.*

## Qué incluye

- **Aprender**: 26 lecciones técnicas en tres secciones.
  - *Aperturas*: italiana, Evans, española (Marshall y berlinesa), gambito de rey, siciliana (Najdorf, Dragón, Morra), francesa, Caro-Kann, gambito de dama rehusado y aceptado, eslava, india de rey, Nimzoindia, Londres, y los gambitos Budapest, Benko y Albin.
  - *Medio juego*: jaques descubiertos y el molino, clavadas y enfiladas, el regalo griego, peón aislado de dama, peones pasados y técnica de torres.
  - *Finales*: casillas clave y oposición, Réti, Lucena, Philidor, la enfilada con peón a y mates básicos contra el reloj.
  - Cada jugada lleva su explicación, y las lecciones citan partidas célebres y libros clásicos (ver **Biblioteca**).
- **Repaso**: cada línea y cada ejercicio se convierten en tarjetas. Juegas de memoria con blancas o con negras, con tiempo por jugada; una respuesta rápida y correcta aplaza la tarjeta (sistema Leitner de 8 cajas), y cualquier error la trae de vuelta. Incluye mazos de "a prueba de errores" (responder a amenazas típicas) y de trampas clásicas, y un modo de presión de tiempo.
- **Ejercicios**: 19 ejercicios tácticos con puntuación tipo Elo.
- **Jugar**: contra el motor (4 niveles) con un entrenador que valora cada jugada y avisa de las amenazas.
- Piezas estándar de Lichess, sonidos distintos para jugada, captura, jaque, enroque y coronación, modo oscuro y tres colores de tablero.

## Añadir contenido

Todo el temario está en JSON (`data/es/` en español, `data/` en inglés). Lee **[docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md)** para ver el formato exacto, y comprueba tus cambios con `tools/validate.html`.

## Ejecutar en local

La app carga las lecciones desde archivos JSON, así que necesita un servidor (abrir `index.html` con doble clic no funciona):

```bash
python -m http.server 8000
```

Luego abre http://localhost:8000.

## Estructura

| Archivo | Función |
|---|---|
| `js/chess.js` | Reglas completas, verificadas con perft |
| `js/engine.js` | Motor alfa-beta con quiescencia, libro de aperturas y nombres de aperturas |
| `js/board.js` | Tablero interactivo (arrastrar o hacer clic), flechas, coronación, animación |
| `js/sound.js` | Sonidos sintetizados (sin archivos de audio) |
| `js/trainer.js` | Motor de ejercicios compartido por lecciones y repaso |
| `js/srs.js` | Repetición espaciada |
| `js/i18n.js`, `js/i18n-es.js` | Idioma de la interfaz |
| `js/pages/*.js` | Páginas: inicio, lección, repaso, ejercicios, jugar |
| `data/` | Temario en JSON |
| `tools/validate.html` | Validador de contenido |

## Créditos

Piezas: conjunto "cburnett" de Colin M.L. Burnett (el estándar de Lichess), licencia CC BY-SA 3.0 / GPL / BSD.
