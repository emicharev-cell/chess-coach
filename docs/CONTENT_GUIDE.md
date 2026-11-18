# Guía de contenido · Content guide

Todo el temario vive en archivos JSON. No hace falta tocar código para añadir aperturas, variantes, partidas famosas o ejercicios.

| Archivo | Contenido |
|---|---|
| `data/es/*.json` | Versión en **español** (la que se ve por defecto) |
| `data/*.json` | Versión en **inglés** |
| `openings.json`, `middlegame.json`, `endgames.json` | Las tres secciones de lecciones |
| `drills.json` | Mazos extra para el modo Repaso |
| `puzzles.json` | Ejercicios tácticos |
| `library.json` | Libros y partidas que citan las lecciones |

> Mantén los dos idiomas sincronizados: mismos `id`, mismo orden de pasos y **las mismas jugadas**. Solo cambian los textos.
> Las jugadas se escriben siempre en notación inglesa (K, Q, R, B, N), como en Lichess: `Nf3`, `Bxc6`, `O-O`, `exd8=Q+`.

## 1. Estructura de una sección

```json
{
  "id": "openings",
  "title": "Aperturas",
  "icon": "📖",
  "blurb": "Descripción corta de la sección.",
  "chapters": [
    { "id": "e4", "title": "Peón de rey: 1.e4", "lessons": [ /* lecciones */ ] }
  ]
}
```

## 2. Una lección

```json
{
  "id": "scotch",
  "title": "Apertura escocesa",
  "eco": "C44–C45",
  "level": 2,
  "side": "w",
  "summary": "Una línea para la tarjeta de la lección.",
  "refs": ["book:capablanca", "game:opera1858"],
  "steps": [ /* pasos */ ]
}
```

- `id`: único y en minúsculas. **No lo cambies** una vez publicado: el progreso y las tarjetas de repaso dependen de él.
- `level`: 1 = Club, 2 = Avanzado, 3 = Experto.
- `side`: `"w"` (blancas), `"b"` (negras) o `"both"` (ambas).
- `refs`: claves de `library.json` (`book:…` o `game:…`).

## 3. Los pasos

Todos los pasos aceptan una posición inicial:

- `"fen"`: una posición FEN. Si se omite, se usa la posición inicial.
- `"setup"`: jugadas que se hacen en silencio antes de empezar, p. ej. `"e4 e5 Nf3 Nc6"`. Es lo más cómodo para aperturas.
- Opcionales: `"title"`, `"text"` (admite `**negrita**`, `*cursiva*`, párrafos con `\n\n` y listas con `- `), `"arrows"` (`[["c4","f7","red"]]`) y `"marks"` (`{"e5":"yellow"}`). Colores: `green`, `blue`, `red`, `orange`, `yellow`.

### `text`: explicación con un diagrama
```json
{ "type": "text", "setup": "e4 e5 Nf3 Nc6 Bb5", "arrows": [["b5","c6","red"]], "text": "La española ataca al defensor de e5…" }
```

### `line`: el alumno juega una variante
```json
{
  "type": "line",
  "you": "w",
  "title": "Línea principal (juegas con blancas)",
  "moves": [
    ["e4", "Ocupa el centro."],
    ["e5", "Simetría."],
    "Nf3",
    ["Nc6", "Defiende e5."]
  ]
}
```
- `you`: `"w"`, `"b"`, `"both"` (el alumno juega las dos) o `"watch"` (solo se avanza con botones: ideal para **partidas históricas**).
- Cada jugada es `"SAN"` o `["SAN", "por qué"]`. La explicación aparece en las notas de las jugadas.
- En las lecciones el profesor anuncia cada jugada con una flecha verde y su explicación antes de que el alumno la haga; las del rival se hacen solas. En el Repaso, la misma línea se juega de memoria.
- Opcional: `"wrong": {"Nc3": "Mensaje para esa jugada concreta"}`.

### `find`: encontrar la jugada (o la combinación)
```json
{
  "type": "find",
  "setup": "e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6",
  "text": "Ignora la clavada.",
  "solution": ["Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5#"],
  "why": "Explicación que aparece al resolverlo.",
  "wrong": { "h3": "Mensaje si juega h3." }
}
```
- `solution` alterna tu jugada / la del rival. Para aceptar varias jugadas en un turno: `[["Qe7", "g6"], …]`.
- Un jaque mate siempre se acepta.
- Si el alumno juega otra cosa, el motor comprueba si es igual de buena. Pon `"engine": false` cuando la idea sea demasiado profunda para el motor del navegador (sacrificios largos, finales teóricos).

### `quiz`: pregunta estratégica
```json
{
  "type": "quiz",
  "setup": "d4 d5 c4 e6",
  "question": "¿Cuál es el plan?",
  "options": [
    { "text": "Opción buena", "correct": true, "why": "Por qué es correcta." },
    { "text": "Opción mala", "why": "Por qué no." }
  ]
}
```
Exactamente una opción con `"correct": true`.

### `play`: técnica contra el motor
```json
{ "type": "play", "fen": "8/8/8/4k3/8/8/8/3QK3 w - - 0 1", "goal": "mate", "you": "w", "moves": 12 }
```
- `goal`: `"mate"` (dar mate en `moves` jugadas), `"promote"` (coronar con seguridad) o `"hold"` (aguantar `moves` jugadas sin perder).

## 4. Repaso (drills)

Cada paso `line` (salvo `you: "watch"`) y cada paso `find` de una lección se convierte **automáticamente** en una tarjeta de repaso. Las líneas de aperturas van a los mazos de repertorio de blancas o negras. Pon `"drill": false` en un paso para excluirlo.

**Las lecciones son la base:** una tarjeta solo aparece en el Repaso cuando su lección está terminada. Los mazos sin ninguna lección terminada salen bloqueados.

Para mazos extra, edita `drills.json`. Cada tarjeta necesita `"lesson"`: el `id` de la lección que la desbloquea.
```json
{
  "decks": [
    {
      "id": "blunder-proof", "title": "…", "icon": "🛡️", "blurb": "…",
      "cards": [
        { "id": "scholar-defence", "lesson": "italian", "title": "…", "you": "b", "setup": "e4 e5 Bc4 Nc6 Qh5",
          "text": "…", "solution": [["g6", "Qe7"]], "why": "…", "wrong": { "Nf6": "…" } }
      ]
    }
  ]
}
```

## 5. Biblioteca

```json
"books": { "mysystem": { "title": "Mi sistema", "author": "Aron Nimzowitsch", "year": 1925, "note": "…" } },
"games": { "opera1858": { "title": "Morphy contra…", "event": "Ópera de París", "year": 1858, "note": "…" } }
```

## 6. Comprueba siempre lo que añades

1. Arranca un servidor local en la carpeta del proyecto: `python -m http.server 8000`
2. Abre <http://localhost:8000/tools/validate.html> (inglés) y <http://localhost:8000/tools/validate.html?lang=es> (español) y pulsa **Run checks**.
3. Debe salir **0 errors**. El validador comprueba que todas las jugadas sean legales, que los quizzes tengan una sola respuesta correcta, que las referencias existan y (opcionalmente) pregunta al motor si cada solución es realmente la mejor.

## Textos de la interfaz

Los botones y mensajes de la aplicación están en `js/i18n-es.js`: cada clave es el texto en inglés y el valor su traducción. Si añades un texto nuevo en el código con `t('…')`, añade su traducción ahí.
