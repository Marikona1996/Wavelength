# Cómo poner el juego en internet

## Primero: por qué Netlify no sirve

Netlify (igual que Vercel o GitHub Pages) aloja **páginas estáticas**: HTML, CSS e imágenes.
Este juego necesita dos cosas que ahí no existen:

1. Un **servidor Node encendido todo el tiempo**, que recuerda de quién es el turno, el marcador
   y dónde está el objetivo.
2. **WebSockets**: la conexión permanente que mantiene la pantalla y los celulares sincronizados
   al instante.

Las funciones de Netlify son *serverless*: se apagan después de cada petición y no admiten
conexiones permanentes. Si lo subes ahí verías la pantalla de inicio, pero los celulares se
quedarían en "Reconectando…" para siempre.

---

# Opción A — Túnel de Cloudflare (la más rápida)

**El juego sigue corriendo en tu computadora**, pero con una dirección de internet para que
entren desde datos móviles o desde otra casa.

**Ventajas:** listo en 2 minutos, sin cuenta, sin registros, no se duerme nunca, y conserva
la partida guardada.
**Desventaja:** tu computadora tiene que estar encendida, y la dirección cambia cada vez.

### Pasos (solo la primera vez)

1. Entra a <https://github.com/cloudflare/cloudflared/releases/latest>
2. Descarga **`cloudflared-windows-amd64.exe`**.
3. Renómbralo a **`cloudflared.exe`**.
4. Ponlo en esta misma carpeta (junto a `server.js`).

### Cada vez que quieras jugar

1. Doble clic en **`Iniciar Wavelength.bat`** (arranca el juego).
2. Doble clic en **`Abrir al internet.bat`**.
3. En la ventana negra aparece una dirección como:
   `https://algo-random-aqui.trycloudflare.com`
4. Esa es la **pantalla**. Ábrela en la TV.
5. Los celulares entran a esa misma dirección **con `/jugar` al final**.
   El QR de la pantalla ya apunta ahí solo: basta con escanearlo.

Deja las dos ventanas negras abiertas mientras juegan.

---

# Opción B — Render (permanente, sin depender de tu compu)

**Ventajas:** queda en línea siempre, con una dirección fija; tu computadora puede estar apagada.
**Desventaja:** en el plan gratuito, si nadie entra en 15 minutos el servidor se duerme y la
siguiente visita tarda entre 30 y 60 segundos en responder.

Render necesita que el código esté en GitHub. Son dos partes.

## Parte 1 — Subir el código a GitHub

1. Crea una cuenta gratis en <https://github.com> (si ya tienes, entra).
2. Arriba a la derecha, botón **+** → **New repository**.
3. Llénalo así:
   - **Repository name:** `wavelength`
   - Marca **Public**
   - **No** marques "Add a README file"
   - Botón **Create repository**
4. En la página que aparece, haz clic en el enlace **"uploading an existing file"**.
5. Abre esta carpeta (`Wavelength Publico`) en el Explorador de Windows.
6. Selecciona **todo lo que hay dentro** (`Ctrl + E` para seleccionar todo) y arrástralo
   a la ventana de GitHub.
   > Son 15 archivos y pesan 208 KB. Si ves una carpeta `node_modules`, **no la subas**:
   > Render la crea sola.
7. Abajo, botón verde **Commit changes**.

## Parte 2 — Publicar en Render

1. Crea una cuenta gratis en <https://render.com> (lo más fácil es entrar con tu cuenta de GitHub).
2. En el panel: **New +** → **Web Service**.
3. Conecta tu GitHub y elige el repositorio `wavelength`.
4. Render lee el archivo `render.yaml` y llena todo solo. Si te lo pide a mano:
   - **Language / Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Botón **Create Web Service** y espera 2 o 3 minutos.
6. Arriba te queda una dirección tipo **`https://wavelength-xxxx.onrender.com`**.

Esa es la **pantalla**. Los celulares entran a la misma dirección **con `/jugar` al final**,
o simplemente escanean el QR.

### Cuando cambies algo (por ejemplo, las tarjetas)

Sube el archivo modificado a GitHub (mismo paso de arrastrar) y Render vuelve a publicar solo
en un par de minutos.

### Truco para el plan gratis

Abre la pantalla **10 minutos antes** de la fiesta para que el servidor despierte. Mientras
haya alguien jugando no se duerme.

---

# ¿Cuál te conviene?

| | Cloudflare (A) | Render (B) | Solo red local |
|---|---|---|---|
| Tiempo de preparación | 2 min | 15 min | 0 |
| Necesita cuenta | No | GitHub + Render | No |
| Tu compu encendida | Sí | No | Sí |
| Dirección fija | No | Sí | No |
| Se duerme | No | Sí (15 min) | No |
| Juegan desde fuera de tu WiFi | Sí | Sí | No |

- **Para una fiesta puntual:** opción A.
- **Para dejarlo listo y reusarlo cuando sea:** opción B.
- **Si todos están en tu casa y en la misma WiFi:** no necesitas nada de esto, solo
  `Iniciar Wavelength.bat`.

---

## Nota sobre la partida guardada

En Render, el archivo `partida.json` se borra cuando el servicio reinicia o despierta
(los planes gratuitos no conservan archivos). Si eso pasa a media partida, el juego vuelve
a la pantalla de inicio. Con la opción A o en local no pasa: el archivo se queda en tu
computadora.
