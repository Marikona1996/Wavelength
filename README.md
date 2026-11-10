# Sintonizados

Juego de leer mentes en equipo para jugar con una pantalla principal (TV / proyector) y los celulares de los jugadores, todo en tiempo real y sin escanear un QR por rol.

## Cómo arrancar

Ya **no necesita servidor propio** (2026-11-05): funciona como los demás juegos de Sobremesa.
- **Link sin código** (`index.html` o la dirección de Render): muestra la portada para **crear una sala** (tele) o **entrar con código** (celular); si esa pantalla tenía una sala abierta hace poco, ofrece "Volver a mi sala".
- **Desde la plataforma**: "Entrar a la sala" abre `public/index.html?crear` y la tele crea (o retoma) su sala sola.
- **La tele lleva el juego** (`public/motor.js`: las reglas que antes estaban en `server.js`, bots y cronómetro incluidos) y guarda la partida en el navegador: si se recarga, sigue donde iba.
- **Conexión con los celulares** por `public/sala.js` (igual que Hilo Mental): con `servidor-local.mjs` → celulares reales en la misma Wi-Fi; en `localhost` sin ese servidor → pestañas del mismo navegador (`jugar.html?sala=CODIGO&yo=1`, `&yo=2`…); publicado → Ably (pendiente: Netlify + `ABLY_API_KEY`).
- **Celulares reales en la misma Wi-Fi**: `node servidor-local.mjs` → http://localhost:8771 (el QR usa la IP de la red).
- **Mazos**: siguen en `mazos/*.json`; si cambias uno, corre `node armar-mazos.mjs` para regenerar `public/mazos.js`.
- **Publicado en Render** (https://wavelength-oqz2.onrender.com/): `npm start` corre `servidor-local.mjs`, que sirve el juego y hace de puente entre la tele y los celulares; `render.yaml` ya trae la configuración. La copia lista para subir a GitHub está en `Dinámicas\Wavelength Publico` (mismos archivos, sin videos ni diseño).
- El servidor Node anterior (`server.js`, `.bat`, `PUBLICAR.md`) quedó en `Versión anterior/servidor-node/`.

## Salas (varias partidas a la vez)

Cada pantalla que abre el juego crea su **propia sala** con un código de 4 letras (por ej. `WZEN`), que queda en la dirección (`/?sala=WZEN`) y se ve arriba y junto al QR. El QR ya lleva el código, así que los celulares entran directo a esa sala (`jugar.html?sala=WZEN`); si alguien entra a `jugar.html` sin código, se le pide. Las salas no se cruzan: cada una tiene sus jugadores, marcador y meta. Para abrir otra partida aparte, abre la página principal sin código en otra pestaña o compu. Recargar la pantalla conserva la sala.

## Flujo del juego

1. **Pantalla de inicio**: nombre de cada equipo, tipo de tarjetas, **meta de puntos** (gana el primer equipo en llegar) y lista de jugadores conectados. `Comenzar juego`. Empieza el equipo del primer jugador que se conectó.
2. **Psíquico**: rota en el **orden en que se conectaron** los jugadores de cada equipo (el primero en entrar es el primer psíquico). **Nadie repite hasta que pasó todo su equipo**; después la fila vuelve a empezar. En su celular saca una tarjeta de **dos lados**, la voltea y elige el lado que quiere usar. Recién entonces se abre la tapa y ve el objetivo. Escribe su palabra o frase y toca `¡Iniciar ronda!`; desde ese momento su pantalla queda bloqueada y el objetivo oculto para todos hasta el final de la ronda.
3. **Adivinar**: en la pantalla aparecen los extremos del lado elegido con el dial tapado. Los compañeros del psíquico mueven la flecha roja desde sus celulares (todos ven la misma flecha en vivo) y cualquiera de ellos toca `¡Estamos listos!`. Hay **1 minuto** para moverla: al acabarse el tiempo la flecha se queda exactamente donde esté y se pasa al rival.
4. **Respuesta del rival**: al equipo contrario le aparece en sus celulares `Izquierda` / `Derecha`. **Basta con que una persona conteste**: la primera respuesta cuenta por todo el equipo (pónganse de acuerdo en voz alta primero). Si no tienen el celular a mano, se puede registrar desde la pantalla.
5. **Revelación**: la tapa se abre y se muestran las cuñas. Puntos: **4 / 3 / 2** según la cuña donde cayó la flecha; el rival suma **+1** si acertó el lado (salvo que el equipo haya dado en el centro exacto). `Siguiente ronda` desde la pantalla (Enter / Espacio) o desde el celular de cualquier jugador.
6. El juego termina en cuanto **un equipo** llega a la meta con sus propios puntos (no se suman los dos equipos). Al cerrar esa ronda: ganador, marcador y resumen. `Jugar de nuevo` mantiene equipos, jugadores, **las tarjetas que faltan por salir** y la posición en la fila de psíquicos.

## Partida de prueba con bots

Para probar o practicar sin celulares, en la sala de espera de la pantalla:

- **🤖 Partida de prueba**: completa cada equipo con bots hasta tener 3 y arranca la partida. Se puede jugar completa solo con la pantalla.
- **+ Bot**: agrega un bot al equipo con menos gente. Se mezclan con jugadores reales.

Los bots viven en el servidor (no tienen celular), salen marcados como **bot** en la pantalla y en los celulares, y juegan con pausas de 1 a 4 segundos:
- **Psíquico bot**: elige un lado de la tarjeta y da una pista según dónde quedó el objetivo (“Muy frío”, “Casi película para llorar”, “Ni barato ni caro”…).
- **Adivinar**: si no hay ninguna persona conectada en el equipo (aparte del psíquico), los bots mueven la aguja y dan “listos”. Si su psíquico es bot le atinan cerca (con algo de error); si es una persona, buscan los extremos en la pista o le tiran a algo razonable.
- **Izquierda/derecha**: si el equipo rival no tiene personas conectadas, contesta un bot.
- **Siguiente ronda**: si el psíquico es bot, la pasa él a los ~6 segundos.

Si hay personas conectadas en el equipo, deciden ellas y los bots esperan. A un bot se le saca como a cualquiera (✕).

## Volver a entrar y jugadores sin señal

- En la pantalla de juego, arriba a la derecha, el botón **QR** muestra el QR, el código y la lista de jugadores con quién está **sin señal** (y una ✕ para sacarlo).
- El mismo celular vuelve solo (guarda su id). Desde un celular nuevo, se escribe **el mismo nombre** (o se toca en la lista “¿Ya estabas jugando?”) y se recupera el equipo, el lugar en la fila de psíquicos y los puntos; a media partida el equipo no cambia aunque se elija otro.
- Si el **psíquico** se queda sin señal mientras saca tarjeta o piensa su pista, la pantalla muestra una cuenta de 30 s y luego pasa el siguiente de su equipo; o se toca **⏭ Seguir sin esperar**.
- Si se **saca al psíquico** a media ronda: antes de dar la pista pasa el siguiente de su equipo; después la ronda sigue (la aguja tiene cronómetro, el rival o la pantalla contestan) y “Siguiente ronda” lo puede tocar cualquiera.

Para probar sin tocar la partida real, abre la tele en otra sala (botón "Sala nueva" o `index.html?sala=PRUEBA`).

Extras: los jugadores pueden entrar tarde (se agregan al final de la fila de psíquicos) o cambiar de equipo mientras la sala está abierta; si un celular se desconecta vuelve a entrar solo con el mismo nombre. En la pantalla, abajo a la derecha:
- `↻ Repetir ronda`: si alguien se desconectó a media ronda, la vuelve a jugar **la misma persona** con una tarjeta nueva (si ya se habían dado puntos, se quitan). No se pierde el turno.
- `Saltar turno`: pasa al siguiente psíquico del mismo equipo.
- `🏁 Terminar partida`: termina la partida en ese momento y muestra los resultados con el marcador actual.
- `Reiniciar juego`: vuelve a la pantalla de inicio conservando a los jugadores.

**Botón secreto para cambiar la tarjeta** (solo el organizador): en el celular del psíquico, tocar **3 veces rápido el logo "Sintonizados"** muestra un botón rojo `Cambiar tarjeta`. No está a la vista para que el mazo no se gaste.

## Mazos (tipos de tarjetas)

En la pantalla de inicio se elige el tipo de tarjetas. Cada mazo es un archivo en la carpeta **`mazos/`**:

- `01_basicas.json` — Básicas (200 tarjetas, 400 lados).
- `02_spicy.json` — Spicy, solo para adultos (200 tarjetas, 400 lados).

Formato de un mazo:

```json
{
  "nombre": "Mi mazo",
  "descripcion": "Texto corto que aparece en la pantalla de inicio",
  "tarjetas": [
    {
      "lado1": { "izquierda": "Frío", "derecha": "Caliente" },
      "lado2": { "izquierda": "Feo", "derecha": "Hermoso" }
    }
  ]
}
```

Para agregar un mazo nuevo, crea otro archivo `.json` en `mazos/` con ese formato; aparece solo en la pantalla de inicio (los archivos se ordenan por nombre). Los mazos se leen al iniciar cada partida, sin reiniciar el servidor. Dentro de una partida no se repiten tarjetas.

## Ajustes finos (`public/motor.js`)

- `GUESS_SECONDS = 60`: segundos que tiene el equipo para mover la flecha.
- El objetivo se sortea con `crypto` (aleatorio real) en toda la media luna, evitando caer a menos de 12° de los últimos 3 objetivos.
- `WEDGE = 7`: ancho en grados de cada cuña (5 cuñas = 35° del dial de 180°). Más chico = más difícil.
- `PORT`: puerto (por defecto 3000).

## Archivos

- `public/motor.js` — lógica del juego (corre en la tele). `public/sala.js` — conexión en tiempo real. `public/client.js` — `connectGame()`, logo y sonidos. `servidor-local.mjs` — servidor opcional para celulares en la misma Wi-Fi.
- `public/index.html` — pantalla principal.
- `public/jugar.html` — pantalla de los celulares.
- `public/dial.js` — el dial (SVG compartido).
- `public/style.css` — estilos de Sintonizados (sitio + caja del juego).
- `public/sobremesa-marca.js` — sello “Creado por Sobremesa” (copia del original en `Juegos interactivos\`; no editar aquí). Tele: abajo a la izquierda; celular: abajo a la derecha.
- `cartas.json` — el mazo.
