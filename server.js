// Wavelength virtual — servidor de juego en tiempo real (Express + WebSocket)
// Pantalla principal: http://localhost:3000   |  Celulares: http://<IP-local>:3000/jugar
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 3000;
const BOOT = Date.now(); // cambia en cada arranque: los clientes con código viejo se recargan solos
const DECKS_DIR = path.join(__dirname, 'mazos');
// La partida en curso, por si se reinicia el servidor. Cada puerto guarda la suya,
// para que un servidor de pruebas nunca pise la partida real.
const STATE_FILE = path.join(__dirname, PORT === 3000 ? 'partida.json' : 'partida-' + PORT + '.json');
const STATE_VERSION = 3;
const LOG_FILE = path.join(__dirname, 'registro.txt');
function log(...partes) {
  const linea = '[' + new Date().toLocaleString('es-MX') + '] ' + (room ? '[' + room.code + '] ' : '') + partes.join(' ');
  console.log(linea);
  try { fs.appendFileSync(LOG_FILE, linea + '\n'); } catch (e) {}
}

// ---------- utilidades ----------
function localIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name]) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}
const IP = localIP();                              // solo para el mensaje de arranque
const joinUrlLocal = () => `http://${localIP()}:${PORT}/jugar`;  // se recalcula: la IP puede cambiar
const esLocal = h => !h || /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(h);
function joinUrlDe(req) {
  const host = req && req.headers && req.headers.host;
  if (esLocal(host)) return joinUrlLocal();                // pantalla abierta en la misma máquina
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.secure ? 'https' : 'http');
  return `${proto}://${host}/jugar`;                       // LAN por IP, o dominio público
}

const validSide = x => x && typeof x.izquierda === 'string' && typeof x.derecha === 'string' && x.izquierda && x.derecha;
// Un mazo es un archivo JSON en mazos/: { nombre, descripcion, tarjetas: [ {lado1, lado2}, ... ] }
// También acepta una lista plana de lados; se emparejan de dos en dos.
function parseDeck(raw) {
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.tarjetas) ? raw.tarjetas : []);
  const cards = list.filter(c => c && validSide(c.lado1) && validSide(c.lado2)).map(c => ({ lado1: c.lado1, lado2: c.lado2 }));
  const flat = list.filter(validSide);
  for (let i = 0; i + 1 < flat.length; i += 2) cards.push({ lado1: flat[i], lado2: flat[i + 1] });
  return cards;
}
function listDecks() {
  try {
    return fs.readdirSync(DECKS_DIR).filter(f => f.endsWith('.json')).sort().map(f => {
      const id = f.replace(/\.json$/, '');
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, f), 'utf8'));
        const cards = parseDeck(raw);
        return { id, nombre: (raw && raw.nombre) || id, descripcion: (raw && raw.descripcion) || '', tarjetas: cards.length };
      } catch (e) {
        console.error('Mazo inválido', f, e.message);
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    console.error('No se pudo leer la carpeta mazos/:', e.message);
    return [];
  }
}
function loadDeck(id) {
  try {
    const cards = parseDeck(JSON.parse(fs.readFileSync(path.join(DECKS_DIR, id + '.json'), 'utf8')));
    if (!cards.length) throw new Error('sin tarjetas válidas');
    return cards;
  } catch (e) {
    console.error('No se pudo leer el mazo', id + ':', e.message);
    return [{ lado1: { izquierda: 'Frío', derecha: 'Caliente' }, lado2: { izquierda: 'Feo', derecha: 'Hermoso' } }];
  }
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- reglas ----------
// El dial va de 0° (extremo izquierdo) a 180° (extremo derecho).
// El objetivo son 5 cuñas de WEDGE grados cada una: 2-3-4-3-2 puntos.
const WEDGE = 7;
const HALF_TARGET = WEDGE * 2.5;
// Tiempo que tiene el equipo para mover la flecha. Al llegar a cero, la flecha
// se queda exactamente donde esté en ese segundo y se pasa al equipo rival.
const GUESS_SECONDS = 60;

function scoreFor(needle, target) {
  const d = Math.abs(needle - target);
  if (d <= WEDGE / 2) return 4;
  if (d <= WEDGE * 1.5) return 3;
  if (d <= WEDGE * 2.5) return 2;
  return 0;
}

// ---------- salas ----------
// Cada pantalla abre su propia sala (código en la dirección: /?sala=ABCD) y los
// celulares entran a /jugar?sala=ABCD, así varias partidas no se cruzan.
// Node atiende un mensaje a la vez: mientras se procesa algo de una sala, `room`
// y `state` apuntan a ella y todo el código del juego trabaja sobre esa sala.
const rooms = new Map();   // código -> { code, state, guessTimer, lastSavedPhase, touched }
let room = null;
let state;
const limpiaCodigo = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
function inRoom(r, fn) {
  const prevRoom = room, prevState = state;
  room = r; state = r.state;
  try { return fn(); } finally { r.state = state; r.touched = Date.now(); room = prevRoom; state = prevState; }
}
function getRoom(code) {
  let r = rooms.get(code);
  if (!r) {
    r = { code, state: null, guessTimer: null, lastSavedPhase: null, touched: Date.now() };
    rooms.set(code, r);
    inRoom(r, () => { state = freshState(false); log('sala nueva'); });
  }
  return r;
}

// ---------- estado ----------
function freshState(keepPlayers) {
  const players = keepPlayers ? state.players : {};
  const teams = {
    // La fila de psíquicos (player.yaPaso) continúa entre partidas: todos pasan en orden de llegada
    A: { name: (keepPlayers && state.teams.A.name) || 'Equipo A', score: 0, turnos: 0 },
    B: { name: (keepPlayers && state.teams.B.name) || 'Equipo B', score: 0, turnos: 0 },
  };
  return {
    phase: 'lobby',           // lobby | psychic | guessing | counter | reveal | finished
    settings: { points: (keepPlayers && state.settings.points) || 10, deck: (keepPlayers && state.settings.deck) || (listDecks()[0] || {}).id || '' },
    teams,
    players,                  // id -> {id, name, team, connected, joinedAt}
    round: 0,
    turn: 0,                  // turnos totales jugados (0-based)
    turnTeam: 'A',
    psychicId: null,
    card: null,             // {lado1, lado2}
    side: null,             // 'lado1' | 'lado2' elegido por el psíquico
    target: null,
    needle: 90,
    lockedBy: null,   // quién bloqueó la flecha
    counterBy: null,  // quién contestó izquierda/derecha
    deadline: null,   // fin del cronómetro para mover la flecha (epoch ms)
    clue: '',
    votes: {},
    counterChoice: null,
    result: null,
    deck: keepPlayers ? state.deck : [],       // tarjetas que aún no salieron (se conserva entre partidas)
    deckId: keepPlayers ? state.deckId : null,  // mazo al que pertenece `deck`
    history: [],
  };
}
// ---------- guardar / recuperar la partida en curso ----------
// Si el servidor se reinicia (se cerró la ventana, se cayó, etc.) cada sala sigue donde iba.
const SALA_VENCE = 12 * 60 * 60 * 1000; // una sala sin movimiento por 12 h se borra
let saveTimer = null;
function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  const salas = {};
  for (const r of rooms.values()) salas[r.code] = { touched: r.touched, state: r === room ? state : r.state };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ v: STATE_VERSION, rooms: salas }));
  } catch (e) { console.error('No se pudo guardar la partida:', e.message); }
}
function saveState() {
  // Un cambio de fase se guarda de inmediato: si el servidor se cae justo ahí, no se pierde.
  if (state.phase !== room.lastSavedPhase) {
    room.lastSavedPhase = state.phase;
    log('fase ->', state.phase, '| ronda', state.round, '| turno', state.turnTeam,
        '| marcador', state.teams.A.score + '-' + state.teams.B.score);
    return saveNow();
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
function restoreRooms() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!raw || raw.v !== STATE_VERSION || !raw.rooms) return;
    for (const [code, d] of Object.entries(raw.rooms)) {
      if (!d || !d.state || Date.now() - d.touched > SALA_VENCE) continue;
      // Nadie está conectado todavía; cada celular se vuelve a marcar al reconectarse.
      for (const p of Object.values(d.state.players || {})) p.connected = false;
      rooms.set(code, { code, state: d.state, guessTimer: null, lastSavedPhase: d.state.phase, touched: d.touched });
    }
    if (rooms.size) console.log(`  ${rooms.size} sala(s) recuperada(s)`);
  } catch (e) {
    console.error('No se pudo recuperar la partida:', e.message);
  }
}
restoreRooms();
// si se recuperó una ronda a medias, el reloj sigue
setImmediate(() => { for (const r of rooms.values()) inRoom(r, armGuessTimer); });

const other = t => (t === 'A' ? 'B' : 'A');
const teamPlayers = (t, onlyConnected = true) =>
  Object.values(state.players)
    .filter(p => p.team === t && (!onlyConnected || p.connected))
    .sort((a, b) => a.joinedAt - b.joinedAt);

function drawCard() {
  // Cada tarjeta sale una sola vez; cuando se acaba el mazo, se vuelve a barajar completo.
  if (state.deckId !== state.settings.deck || !state.deck.length) { state.deck = shuffle(loadDeck(state.settings.deck)); state.deckId = state.settings.deck; }
  state.card = state.deck.pop();
  state.side = null;
  state.target = null; // el objetivo se genera cuando el psíquico elige el lado
}
// Aleatorio de verdad (crypto, no Math.random) en TODA la media luna.
// Solo se deja el margen mínimo para que la cuña central siempre se pueda alcanzar.
const MARGEN = WEDGE / 2;                       // 3.5°
const MIN_TARGET = MARGEN, MAX_TARGET = 180 - MARGEN;
function azar() { return crypto.randomInt(0, 2 ** 31) / 2 ** 31; }  // [0,1)
function nuevoTarget() {
  const ultimos = state.history.slice(-3).map(h => h.target).filter(t => typeof t === 'number');
  let t = 0;
  // Hasta 25 intentos para no caer cerca de los últimos objetivos (evita que "se repita mucho")
  for (let i = 0; i < 25; i++) {
    t = Math.round((MIN_TARGET + azar() * (MAX_TARGET - MIN_TARGET)) * 10) / 10; // 1 decimal: ~1730 posiciones
    if (!ultimos.some(u => Math.abs(u - t) < 12)) break;
  }
  return t;
}
function chooseSide(side) {
  state.side = side;
  state.target = nuevoTarget();
  log('objetivo en', state.target + '°');
}
const activeSide = () => (state.card && state.side ? state.card[state.side] : null);

// El psíquico rota en el orden en que se conectaron los jugadores del equipo
// (el primero en entrar es el primer psíquico). Nadie repite hasta que todos
// los de su equipo pasaron; entonces la fila vuelve a empezar. Se respeta el
// orden aunque el celular esté desconectado (puede estar solo bloqueado); si
// alguien de verdad no está, la pantalla puede "Saltar turno".
function pickPsychic(t) {
  const all = teamPlayers(t, false);
  if (!all.length) return null;
  let pendientes = all.filter(p => !p.yaPaso);
  if (!pendientes.length) { for (const p of all) p.yaPaso = false; pendientes = all; }
  pendientes[0].yaPaso = true;
  return pendientes[0].id;
}
const faltanPorPasar = t => teamPlayers(t, false).filter(p => !p.yaPaso).length;
// La partida termina en cuanto un equipo llega a los puntos elegidos.
const reachedGoal = () => state.teams.A.score >= state.settings.points || state.teams.B.score >= state.settings.points;

function startTurn() {
  const t = state.turnTeam;
  const psychicId = pickPsychic(t);
  if (!psychicId) {
    // sin jugadores conectados en este equipo: saltar turno
    state.turnTeam = other(t);
    state.turn++;
    if (state.turn > 200) return finishGame();
    return startTurn();
  }
  state.psychicId = psychicId;
  state.teams[t].turnos = (state.teams[t].turnos || 0) + 1;
  state.round = Math.floor(state.turn / 2) + 1;
  state.needle = 90;
  state.lockedBy = null;
  state.counterBy = null;
  clearGuessTimer();
  state.deadline = null;
  state.clue = '';
  state.votes = {};
  state.counterChoice = null;
  state.result = null;
  drawCard();
  state.phase = 'psychic';
}

// Si se va (o se quita) el psíquico mientras saca tarjeta / piensa su pista,
// el turno pasa al siguiente de su equipo para que la partida no se trabe.
function quitarJugador(id) {
  if (!state.players[id]) return;
  log('salió:', state.players[id].name);
  delete state.players[id];
  if (id === state.psychicId && state.phase === 'psychic') startTurn();
}

function nextTurn() {
  if (reachedGoal()) return finishGame(); // alguien llegó a la meta: se acaba el juego
  state.turn++;
  state.turnTeam = other(state.turnTeam);
  startTurn();
}

function finishGame() {
  state.phase = 'finished';
  state.psychicId = null;
}

function resolveCounter() {
  const t = state.turnTeam;
  const o = other(t);
  const wedge = scoreFor(state.needle, state.target);
  const correctSide = state.target < state.needle ? 'izq' : 'der';
  const counterCorrect = wedge !== 4 && state.counterChoice === correctSide;
  const pts = { A: 0, B: 0 };
  pts[t] = wedge;
  if (counterCorrect) pts[o] = 1;
  state.teams.A.score += pts.A;
  state.teams.B.score += pts.B;
  state.result = { wedge, correctSide, counterCorrect, points: pts, needle: state.needle, target: state.target,
    lockedBy: state.lockedBy, counterBy: state.counterBy };
  state.history.push({ round: state.round, team: t, card: activeSide(), ...state.result });
  state.phase = 'reveal';
}

// ---------- cronómetro de la ronda ----------
function clearGuessTimer() { if (room.guessTimer) { clearTimeout(room.guessTimer); room.guessTimer = null; } }
function lockAnswer(quien) {
  clearGuessTimer();
  state.deadline = null;
  state.lockedBy = quien || 'el tiempo';
  state.votes = {};
  state.phase = 'counter'; // siempre se pregunta al rival: izquierda o derecha
}
function armGuessTimer() {
  clearGuessTimer();
  if (state.phase !== 'guessing') return;
  if (!state.deadline) state.deadline = Date.now() + GUESS_SECONDS * 1000;
  const r = room;
  r.guessTimer = setTimeout(() => inRoom(r, () => {
    r.guessTimer = null;
    if (state.phase !== 'guessing') return;
    log('  Se acabó el tiempo: la flecha se queda en', state.needle.toFixed(1) + '°');
    lockAnswer('⏱ el tiempo'); // la flecha queda donde esté en ese instante
    broadcast();
  }), Math.max(0, state.deadline - Date.now()));
}

function tally() {
  const c = { izq: 0, der: 0 };
  for (const v of Object.values(state.votes)) c[v]++;
  return c;
}

// ---------- vistas por cliente ----------
function viewFor(client) {
  const revealTarget = state.phase === 'reveal' || state.phase === 'finished';
  const isPsychic = client.role === 'player' && client.playerId === state.psychicId;
  const psychicPeek = isPsychic && state.phase === 'psychic' && !!state.side;
  const t = tally();
  const voters = state.phase === 'counter' ? Math.max(teamPlayers(other(state.turnTeam)).length, Object.keys(state.votes).length) : 0;
  return {
    phase: state.phase,
    settings: state.settings,
    teams: state.teams,
    players: Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt),
    round: state.round,
    turn: state.turn,
    reached: reachedGoal(),
    faltanPsiquicos: faltanPorPasar('A') + faltanPorPasar('B'),
    psychicOrder: { A: teamPlayers('A', false).map(p => p.id), B: teamPlayers('B', false).map(p => p.id) },
    turnTeam: state.turnTeam,
    psychicId: state.psychicId,
    card: state.phase === 'lobby' || state.phase === 'psychic' ? null : activeSide(),
    cardSides: isPsychic && state.phase === 'psychic' ? state.card : null,
    side: state.side,
    target: revealTarget || psychicPeek ? state.target : null,
    needle: state.needle,
    lockedBy: state.lockedBy,
    counterBy: state.counterBy,
    clue: state.clue,
    tally: t,
    voters,
    votedIds: Object.keys(state.votes),
    myVote: client.playerId ? state.votes[client.playerId] || null : null,
    counterChoice: state.counterChoice,
    result: state.result,
    history: state.history,
    wedge: WEDGE,
    decks: state.phase === 'lobby' ? listDecks() : undefined,
    // milisegundos que quedan (relativo, para que no importe el reloj del celular)
    remainingMs: state.phase === 'guessing' && state.deadline ? Math.max(0, state.deadline - Date.now()) : null,
    guessSeconds: GUESS_SECONDS,
    boot: BOOT,
    sala: room.code,
    joinUrl: joinUrlLocal() + '?sala=' + room.code,
    me: client.playerId ? state.players[client.playerId] || null : null,
  };
}

const clients = new Set();
function broadcast() {
  saveState();
  for (const c of clients) {
    if (c.room === room && c.ws.readyState === 1) c.ws.send(JSON.stringify({ type: 'state', state: viewFor(c) }));
  }
}

// ---------- acciones ----------
function handle(client, msg) {
  // Lo primero que manda cada pantalla o celular es 'hello' con el código de su sala.
  if (msg.type === 'hello') {
    const code = limpiaCodigo(msg.sala);
    if (!code) return;
    client.room = getRoom(code);
  }
  if (!client.room) return;
  inRoom(client.room, () => handleInRoom(client, msg));
}

function handleInRoom(client, msg) {
  const { type } = msg;

  if (type === 'hello') {
    client.role = msg.role === 'host' ? 'host' : 'player';
    if (client.role === 'player' && msg.playerId && state.players[msg.playerId]) {
      client.playerId = msg.playerId;
      state.players[msg.playerId].connected = true;
    }
    return broadcast();
  }

  // ----- jugador -----
  if (type === 'join') {
    const name = String(msg.name || '').trim().slice(0, 24);
    const team = msg.team === 'B' ? 'B' : 'A';
    if (!name) return;
    let id = client.playerId && state.players[client.playerId] ? client.playerId : (msg.playerId && state.players[msg.playerId] ? msg.playerId : null);
    if (!id) {
      // ¿Volvió alguien que perdió el link o cambió de celular? Si entra con el mismo
      // nombre, retoma su lugar (equipo, fila y turno de psíquico) en vez de duplicarse.
      const mismo = Object.values(state.players).find(p => p.name.trim().toLowerCase() === name.toLowerCase());
      if (mismo && mismo.connected) {
        client.ws.send(JSON.stringify({ type: 'error', message: `Ya hay alguien conectado como "${mismo.name}". Usa otro nombre.` }));
        return;
      }
      id = mismo ? mismo.id : uid();
      if (mismo) log('volvió a entrar:', mismo.name);
    }
    if (!state.players[id]) state.players[id] = { id, joinedAt: Date.now() };
    Object.assign(state.players[id], { name, team, connected: true });
    client.playerId = id;
    client.ws.send(JSON.stringify({ type: 'joined', playerId: id }));
    return broadcast();
  }

  if (type === 'leave' && client.playerId) {
    quitarJugador(client.playerId);
    client.playerId = null;
    return broadcast();
  }

  const me = client.playerId ? state.players[client.playerId] : null;
  const isPsychic = me && me.id === state.psychicId;
  const isActiveTeam = me && me.team === state.turnTeam;
  const isOtherTeam = me && me.team === other(state.turnTeam);

  if (type === 'redraw' && isPsychic && state.phase === 'psychic' && !state.side) {
    drawCard();
    return broadcast();
  }
  if (type === 'chooseSide' && isPsychic && state.phase === 'psychic' && !state.side) {
    if (msg.side !== 'lado1' && msg.side !== 'lado2') return;
    chooseSide(msg.side);
    return broadcast();
  }
  if (type === 'beginGuess' && isPsychic && state.phase === 'psychic' && state.side) {
    state.clue = String(msg.clue || '').trim().slice(0, 200); // frase completa, sin recortar
    state.phase = 'guessing';
    state.deadline = Date.now() + GUESS_SECONDS * 1000;
    armGuessTimer();
    return broadcast();
  }
  if (type === 'needle' && state.phase === 'guessing' && isActiveTeam) {
    // El psíquico no toca la flecha (salvo que sea el único conectado de su equipo).
    if (isPsychic && teamPlayers(state.turnTeam).length > 1) return;
    const a = Number(msg.angle);
    if (!Number.isFinite(a)) return;
    state.needle = Math.max(0, Math.min(180, Math.round(a * 10) / 10));
    return broadcast();
  }
  if (type === 'lock' && state.phase === 'guessing' && isActiveTeam) {
    if (isPsychic && teamPlayers(state.turnTeam).length > 1) return;
    lockAnswer(me.name);
    log('bloqueó la flecha:', me.name, '(' + state.needle.toFixed(1) + '°)');
    return broadcast();
  }
  if (type === 'vote' && state.phase === 'counter' && isOtherTeam) {
    if (msg.side !== 'izq' && msg.side !== 'der') return;
    // Con que UNA persona del equipo rival conteste, decide por todo su equipo.
    state.votes[me.id] = msg.side;
    state.counterChoice = msg.side;
    state.counterBy = me.name;
    log('contestó ' + (msg.side === 'izq' ? 'izquierda' : 'derecha') + ':', me.name);
    resolveCounter();
    return broadcast();
  }
  if (type === 'next' && state.phase === 'reveal' && (client.role === 'host' || isPsychic)) {
    nextTurn();
    return broadcast();
  }

  // ----- host -----
  if (client.role !== 'host') return;

  if (type === 'setup') {
    if (msg.teamA) state.teams.A.name = String(msg.teamA).trim().slice(0, 30) || 'Equipo A';
    if (msg.teamB) state.teams.B.name = String(msg.teamB).trim().slice(0, 30) || 'Equipo B';
    if (msg.points) state.settings.points = Math.max(1, Math.min(100, Number(msg.points) | 0));
    if (msg.deck && listDecks().some(d => d.id === msg.deck)) state.settings.deck = msg.deck;
    return broadcast();
  }
  if (type === 'start' && state.phase === 'lobby') {
    if (!teamPlayers('A').length || !teamPlayers('B').length) return;
    state.teams.A.score = 0; state.teams.B.score = 0;
    state.teams.A.turnos = 0; state.teams.B.turnos = 0;
    // Empieza el equipo del primer jugador que se conectó
    const first = Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    state.turn = 0; state.turnTeam = first ? first.team : 'A';
    state.history = [];
    startTurn();
    return broadcast();
  }
  if (type === 'forceCounter' && state.phase === 'counter') {
    // el host decide el lado por el rival (por ejemplo, si nadie tiene celular a mano)
    if (msg.side !== 'izq' && msg.side !== 'der') return;
    state.counterChoice = msg.side;
    resolveCounter();
    return broadcast();
  }
  if (type === 'repeatTurn' && ['psychic', 'guessing', 'counter', 'reveal'].includes(state.phase)) {
    // Si ya se habían dado los puntos (fase reveal), se deshacen primero.
    if (state.phase === 'reveal' && state.result) {
      state.teams.A.score -= state.result.points.A;
      state.teams.B.score -= state.result.points.B;
      state.history.pop();
      log('se deshizo el resultado de la ronda', state.round);
    }
    const mismoPsiquico = state.psychicId;
    clearGuessTimer();
    state.deadline = null;
    state.needle = 90;
    state.lockedBy = null;
    state.counterBy = null;
    state.clue = '';
    state.votes = {};
    state.counterChoice = null;
    state.result = null;
    drawCard();
    state.psychicId = mismoPsiquico; // no se pierde el turno: repite la misma persona
    state.phase = 'psychic';
    log('RONDA REPETIDA (mismo psíquico, tarjeta nueva)');
    return broadcast();
  }
  if (type === 'skipTurn' && ['psychic', 'guessing', 'counter'].includes(state.phase)) {
    startTurn(); // mismo equipo, siguiente psíquico, nueva carta
    return broadcast();
  }
  if (type === 'endGame' && ['psychic', 'guessing', 'counter', 'reveal'].includes(state.phase)) {
    // La pantalla puede terminar la partida cuando quiera; gana quien vaya arriba.
    clearGuessTimer();
    state.deadline = null;
    log('PARTIDA TERMINADA desde la pantalla');
    finishGame();
    return broadcast();
  }
  if (type === 'kick' && msg.playerId) {
    quitarJugador(msg.playerId);
    for (const c of clients) if (c.room === room && c.playerId === msg.playerId) { c.playerId = null; c.ws.send(JSON.stringify({ type: 'kicked' })); }
    return broadcast();
  }
  if (type === 'reset') {
    clearGuessTimer();
    state = freshState(true);
    return broadcast();
  }
}

// ---------- servidor ----------
const app = express();
// Nunca cachear: los celulares siempre bajan la última versión
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); res.set('Pragma', 'no-cache'); res.set('Expires', '0'); next(); });
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, maxAge: 0 }));
app.get('/jugar', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'jugar.html')));
app.get('/api/info', (req, res) => res.json({ ip: IP, port: PORT, joinUrl: joinUrlDe(req) }));
app.get('/api/qr.svg', async (req, res) => {
  const code = limpiaCodigo(req.query.sala);
  const svg = await QRCode.toString(joinUrlDe(req) + (code ? '?sala=' + code : ''), { type: 'svg', margin: 1, color: { dark: '#010625', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  const client = { ws, role: 'player', playerId: null, room: null };
  clients.add(client);
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try { handle(client, msg); } catch (e) { log('[ERROR] al procesar', JSON.stringify(msg), String(e && e.stack || e)); }
  });
  ws.on('close', () => {
    clients.delete(client);
    if (!client.room) return;
    inRoom(client.room, () => {
      if (client.playerId && state.players[client.playerId]) {
        // ¿queda otra conexión del mismo jugador?
        const still = [...clients].some(c => c.playerId === client.playerId);
        if (!still) state.players[client.playerId].connected = false;
      }
      broadcast();
    });
  });
});

// latido para limpiar conexiones muertas
setInterval(() => {
  for (const c of clients) {
    if (c.ws.readyState !== 1) { clients.delete(c); continue; }
    c.ws.ping();
  }
}, 15000);

// salas abandonadas: nadie conectado y sin movimiento por 12 h
setInterval(() => {
  let borradas = 0;
  for (const r of rooms.values()) {
    if (Date.now() - r.touched < SALA_VENCE || [...clients].some(c => c.room === r)) continue;
    if (r.guessTimer) clearTimeout(r.guessTimer);
    rooms.delete(r.code);
    borradas++;
  }
  if (borradas) saveNow();
}, 30 * 60 * 1000);

process.on('uncaughtException', e => log('[ERROR NO ATRAPADO]', String(e && e.stack || e)));
process.on('unhandledRejection', e => log('[PROMESA RECHAZADA]', String(e && e.stack || e)));

log('=== servidor iniciado ===');
// Si el puerto ya está ocupado (otra copia del juego abierta), avisar y salir
// para que el .bat lo reintente, en vez de quedarse como proceso zombi.
server.on('error', e => {
  if (e && e.code === 'EADDRINUSE') {
    log('El puerto ' + PORT + ' ya está en uso: ya hay otra ventana del juego abierta. Cierra esa ventana o usa solo una.');
  } else {
    log('[ERROR DEL SERVIDOR]', String(e && e.stack || e));
  }
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  WAVELENGTH virtual');
  console.log(`  Pantalla principal:  http://localhost:${PORT}`);
  console.log(`  Celulares (misma WiFi):  ${joinUrlLocal()}`);
  console.log('');
});
