# Mesa DJ · etapa 1

Simulador de mesa DJ para tablet, con la distribución de un controlador de 2 decks de iniciación. Pensado para practicar con tus propios mp3 antes de comprar el físico. Proyecto personal, sin afiliación con ninguna marca.

## Publicarlo en GitHub Pages
1. Sube todos los archivos de esta carpeta a la raíz de un repositorio.
2. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
3. Abre la dirección que te da GitHub en el navegador de la tablet, en horizontal. "Añadir a pantalla de inicio" la deja como una app.

También funciona abriendo `index.html` directamente desde el almacenamiento del dispositivo (no usa módulos ni red).

## Cómo se usa
- **LOAD** (centro, uno por deck): elige un archivo de audio de la tablet. No se sube a ningún sitio.
- **PLAY/PAUSE** y **CUE** (estilo Pioneer):
  - Sonando, CUE vuelve al punto cue y pausa.
  - En pausa y fuera del cue, CUE fija ahí el punto cue.
  - En pausa sobre el cue, mantener CUE suena mientras lo pulsas; al soltar vuelve. Si pulsas PLAY sin soltar CUE, sigue sonando.
- **Fader de tempo** (±8 %): como en la mesa real, **arriba es más lento (–)** y **abajo más rápido (+)**. Doble toque = vuelve a 0.
- **Pantalla**: BPM de la pista, tempo, tiempo y tiempo restante. Arriba la vista general (toca o arrastra para saltar), debajo la onda con scroll con la rejilla de pulsos (líneas blancas), el punto cue (naranja) y el cabezal (rojo).
- **½ / ×2**: corrige el BPM si el detector se queda con la mitad o el doble (pasa con tempos muy rápidos, p. ej. 170 se detecta como 85).
- El anillo del jog muestra el progreso de la pista y el plato gira a 33⅓ rpm.

Los controles **atenuados** están dibujados pero se activan en etapas posteriores.

## Hoja de ruta
1. **Hecho:** panel completo, cargar, play, cue, tempo, BPM, waveform y rejilla de pulsos.
2. Crossfader, faders de canal, trim, vúmetros, master level.
3. EQ de 3 bandas y CFX.
4. Jogs (pitch bend), Beat Sync (+ SHIFT para el rango de tempo) y loops.
5. Pads (hot cues, beat jump, loops, sampler) y mezcla de auriculares.
6. Beat FX y modo app instalable (funciona sin conexión).

## Estructura (cada archivo toca una sola cosa)
| Archivo | Qué hace |
|---|---|
| `analyze.js` | Detección de BPM y de la rejilla de pulsos |
| `engine.js` | Motor de audio de un deck: play, pausa, cue, tempo, seek |
| `waveform.js` | Cálculo y dibujo de las ondas |
| `controls.js` | Botón, knob y fader táctiles (multitáctil) |
| `panel.js` | Maqueta del panel y la pantalla |
| `main.js` | Une todo: carga de archivos y bucle de dibujo |
| `style.css` | Aspecto |

## Límites conocidos
- Sin *key lock*: al cambiar el tempo cambia también el tono, como en un vinilo.
- La detección de BPM es una estimación; en pistas con ritmo poco marcado puede fallar. Usa ½ / ×2.
- El audio por Bluetooth añade retardo: usa auriculares con cable.
- Se pueden cargar los dos decks, pero hasta la etapa 2 no hay volumen por canal ni crossfader.
