# Wavelength virtual

Versión digital de Wavelength para jugar con una pantalla principal (TV / proyector) y los celulares de los jugadores, todo en tiempo real y sin escanear un QR por rol.

## Cómo arrancar

1. Doble clic en **`Iniciar Wavelength.bat`** (o en una terminal: `npm install` la primera vez y luego `npm start`).
2. Se abre la pantalla principal en `http://localhost:3000`. Ponla en la TV / proyector.
3. Los jugadores entran desde su celular, **en la misma WiFi**, a la dirección que muestra la pantalla (por ej. `http://192.168.100.121:3000/jugar`). El QR es solo un atajo para no teclear.
4. Cada jugador pone su nombre y elige su equipo. Se conecta una sola vez para toda la partida.

> Si Windows pregunta si permitir que Node.js use la red, acepta en **redes privadas**. Si los celulares no llegan a la dirección, revisa que estén en la misma WiFi y que el firewall permita Node.js.

## Flujo del juego

1. **Pantalla de inicio**: nombre de cada equipo, tipo de tarjetas, **meta de puntos** (gana el primer equipo en llegar) y lista de jugadores conectados. `Comenzar juego`. Empieza el equipo del primer jugador que se conectó.
2. **Psíquico**: rota en el **orden en que se conectaron** los jugadores de cada equipo (el primero en entrar es el primer psíquico; todos pasan). En su celular saca una tarjeta de **dos lados**, la voltea y elige el lado que quiere usar. Recién entonces se abre la tapa y ve el objetivo. Escribe su palabra o frase y toca `¡Iniciar ronda!`; desde ese momento su pantalla queda bloqueada y el objetivo oculto para todos hasta el final de la ronda.
3. **Adivinar**: en la pantalla aparecen los extremos del lado elegido con el dial tapado. Los compañeros del psíquico mueven la flecha roja desde sus celulares (todos ven la misma flecha en vivo) y cualquiera de ellos toca `¡Estamos listos!`. Hay **1 minuto** para moverla: al acabarse el tiempo la flecha se queda exactamente donde esté y se pasa al rival.
4. **Respuesta del rival**: al equipo contrario le aparece en sus celulares `Izquierda` / `Derecha`. **Basta con que una persona conteste**: la primera respuesta cuenta por todo el equipo (pónganse de acuerdo en voz alta primero). Si no tienen el celular a mano, se puede registrar desde la pantalla.
5. **Revelación**: la tapa se abre y se muestran las cuñas. Puntos: **4 / 3 / 2** según la cuña donde cayó la flecha; el rival suma **+1** si acertó el lado (salvo que el equipo haya dado en el centro exacto). `Siguiente ronda` desde la pantalla (Enter / Espacio) o desde el celular de cualquier jugador.
6. El juego termina cuando un equipo llega a la meta **y además todos los jugadores ya fueron psíquicos** (cada equipo juega al menos tantos turnos como integrantes tiene). Así nadie se queda sin su turno. Al cerrar esa ronda: ganador, marcador y resumen. `Jugar de nuevo` mantiene equipos, jugadores, **las tarjetas que faltan por salir** y la posición en la fila de psíquicos.

Extras: los jugadores pueden entrar tarde (se agregan al final de la fila de psíquicos) o cambiar de equipo mientras la sala está abierta; si un celular se desconecta vuelve a entrar solo con el mismo nombre. En la pantalla, abajo a la derecha:
- `↻ Repetir ronda`: si alguien se desconectó a media ronda, la vuelve a jugar **la misma persona** con una tarjeta nueva (si ya se habían dado puntos, se quitan). No se pierde el turno.
- `Saltar turno`: pasa al siguiente psíquico del mismo equipo.
- `Reiniciar juego`: vuelve a la pantalla de inicio conservando a los jugadores.

**Botón secreto para cambiar la tarjeta** (solo el organizador): en el celular del psíquico, tocar **3 veces rápido el logo "WAVELENGTH"** muestra un botón rojo `Cambiar tarjeta`. No está a la vista para que el mazo no se gaste.

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

## Ajustes finos (`server.js`)

- `GUESS_SECONDS = 60`: segundos que tiene el equipo para mover la flecha.
- El objetivo se sortea con `crypto` (aleatorio real) en toda la media luna, evitando caer a menos de 12° de los últimos 3 objetivos.
- `WEDGE = 7`: ancho en grados de cada cuña (5 cuñas = 35° del dial de 180°). Más chico = más difícil.
- `PORT`: puerto (por defecto 3000).

## Archivos

- `server.js` — lógica del juego y sincronización en tiempo real (Express + WebSocket).
- `public/index.html` — pantalla principal.
- `public/jugar.html` — pantalla de los celulares.
- `public/dial.js` — el dial (SVG compartido).
- `public/style.css` — estilos con la paleta de Wavelength (sitio + caja del juego).
- `cartas.json` — el mazo.
