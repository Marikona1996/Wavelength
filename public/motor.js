// Sintonizados — motor del juego. Vive en la PANTALLA PRINCIPAL (tele): ya no hay servidor propio.
// Son las mismas reglas que tenía server.js; la tele lleva el estado, corre los bots y el cronómetro,
// y habla con los celulares por sala.js (red local, pestañas o Ably, como los demás juegos).
//
//   MotorSintonizados.crear({ sala, joinUrl, alHost(msg), enviarA(conn, msg), difundir(msg) })
//     -> { host(msg), celular(conn, msg), revisarSenal() }
// Los mensajes son los mismos de antes: {type:'state'|'needle'|'joined'|'kicked', ...}.
window.MotorSintonizados = (() => {
  const log = (...p) => console.log('[Sintonizados]', ...p);

  // ---------- mazos (public/mazos.js) ----------
  const validSide = x => x && typeof x.izquierda === 'string' && typeof x.derecha === 'string' && x.izquierda && x.derecha;
  function parseDeck(list) {
    list = Array.isArray(list) ? list : [];
    return list.filter(c => c && validSide(c.lado1) && validSide(c.lado2)).map(c => ({ lado1: c.lado1, lado2: c.lado2 }));
  }
  const listDecks = () => (window.MAZOS || []).map(m => ({ id: m.id, nombre: m.nombre, descripcion: m.descripcion, tarjetas: parseDeck(m.tarjetas).length }));
  function loadDeck(id) {
    const m = (window.MAZOS || []).find(d => d.id === id);
    const cards = m ? parseDeck(m.tarjetas) : [];
    return cards.length ? cards : [{ lado1: { izquierda: 'Frío', derecha: 'Caliente' }, lado2: { izquierda: 'Feo', derecha: 'Hermoso' } }];
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const uid = () => Math.random().toString(36).slice(2, 10);
  // Aleatorio de verdad (crypto), como antes en el servidor
  function azar() { return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32; }  // [0,1)

  // ---------- reglas ----------
  // El dial va de 0° (extremo izquierdo) a 180° (extremo derecho).
  // El objetivo son 5 cuñas de WEDGE grados cada una: 2-3-4-3-2 puntos.
  const WEDGE = 7;
  // Tiempo para mover la flecha. Al llegar a cero, la flecha se queda donde esté.
  const GUESS_SECONDS = 60;
  function scoreFor(needle, target) {
    const d = Math.abs(needle - target);
    if (d <= WEDGE / 2) return 4;
    if (d <= WEDGE * 1.5) return 3;
    if (d <= WEDGE * 2.5) return 2;
    return 0;
  }
  const MARGEN = WEDGE / 2;
  const MIN_TARGET = MARGEN, MAX_TARGET = 180 - MARGEN;
  const NOMBRES_BOT = ['Lupita', 'Memo', 'Chuy', 'Paty', 'Toño', 'Rocío', 'Beto', 'Mayra', 'Nacho', 'Gaby', 'Pepe', 'Sofi', 'Lalo', 'Vero', 'Quique', 'Fer'];
  const pausa = (min = 1000, max = 4000) => min + Math.random() * (max - min);
  const ESPERA_SIN_SENAL = 30000;   // psíquico sin señal: se le espera y luego pasa el siguiente
  const SIN_SENAL_MS = 15000;       // un celular que no da señales en 15 s se marca "sin señal"
  const SALA_VENCE = 12 * 60 * 60 * 1000;
  const GUARDADO = 'sin_tele';

  function crear(opc) {
    const room = { code: opc.sala, guessTimer: null, botTimer: null, botKey: null, botAt: null, lastSavedPhase: null };
    let state = null;

    // ---------- conexiones ----------
    // host = la propia tele. Cada celular es una "conexión" (conn) que manda latidos;
    // conn.playerId apunta al jugador que maneja (cambia si alguien entra con su nombre desde otro celular).
    const hostClient = { role: 'host', playerId: null, send: msg => opc.alHost(msg) };
    const conns = new Map();   // conn -> { conn, role, playerId, visto, send }
    const clients = () => [hostClient, ...conns.values()];

    // ---------- estado ----------
    function freshState(keepPlayers) {
      const players = keepPlayers ? state.players : {};
      const teams = {
        A: { name: (keepPlayers && state.teams.A.name) || 'Equipo A', score: 0, turnos: 0 },
        B: { name: (keepPlayers && state.teams.B.name) || 'Equipo B', score: 0, turnos: 0 },
      };
      return {
        phase: 'lobby',           // lobby | psychic | guessing | counter | reveal | finished
        settings: { points: (keepPlayers && state.settings.points) || 10, deck: (keepPlayers && state.settings.deck) || (listDecks()[0] || {}).id || '' },
        teams, players,
        round: 0, turn: 0, turnTeam: 'A', psychicId: null,
        card: null, side: null, target: null, needle: 90,
        lockedBy: null, counterBy: null, deadline: null,
        clue: '', votes: {}, counterChoice: null, result: null,
        deck: keepPlayers ? state.deck : [], deckId: keepPlayers ? state.deckId : null,
        history: [],
      };
    }

    // ---------- guardar / recuperar (si se recarga la tele, la partida sigue) ----------
    let saveTimer = null;
    function saveNow() {
      clearTimeout(saveTimer); saveTimer = null;
      try { localStorage.setItem(GUARDADO, JSON.stringify({ code: room.code, touched: Date.now(), state })); } catch (e) {}
    }
    function saveState() {
      if (state.phase !== room.lastSavedPhase) {
        room.lastSavedPhase = state.phase;
        log('fase ->', state.phase, '| ronda', state.round, '| turno', state.turnTeam, '| marcador', state.teams.A.score + '-' + state.teams.B.score);
        return saveNow();
      }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, 250);
    }
    try {
      const g = JSON.parse(localStorage.getItem(GUARDADO));
      if (g && g.code === room.code && g.state && Date.now() - g.touched < SALA_VENCE) {
        state = g.state;
        // nadie está conectado todavía; cada celular se vuelve a marcar con su primer latido
        for (const p of Object.values(state.players || {})) p.connected = !!p.bot;
        room.lastSavedPhase = state.phase;
        log('partida recuperada');
      }
    } catch (e) {}
    if (!state) state = freshState(false);

    const other = t => (t === 'A' ? 'B' : 'A');
    const teamPlayers = (t, onlyConnected = true) =>
      Object.values(state.players).filter(p => p.team === t && (!onlyConnected || p.connected)).sort((a, b) => a.joinedAt - b.joinedAt);

    function drawCard() {
      // Cada tarjeta sale una sola vez; cuando se acaba el mazo, se vuelve a barajar completo.
      if (state.deckId !== state.settings.deck || !state.deck.length) { state.deck = shuffle(loadDeck(state.settings.deck)); state.deckId = state.settings.deck; }
      state.card = state.deck.pop();
      state.side = null;
      state.target = null;
    }
    function nuevoTarget() {
      const ultimos = state.history.slice(-3).map(h => h.target).filter(t => typeof t === 'number');
      let t = 0;
      for (let i = 0; i < 25; i++) {
        t = Math.round((MIN_TARGET + azar() * (MAX_TARGET - MIN_TARGET)) * 10) / 10;
        if (!ultimos.some(u => Math.abs(u - t) < 12)) break;
      }
      return t;
    }
    function chooseSide(side) { state.side = side; state.target = nuevoTarget(); }
    const activeSide = () => (state.card && state.side ? state.card[state.side] : null);

    // El psíquico rota en orden de llegada; nadie repite hasta que pasaron todos los de su equipo.
    function pickPsychic(t) {
      const all = teamPlayers(t, false);
      if (!all.length) return null;
      let pendientes = all.filter(p => !p.yaPaso);
      if (!pendientes.length) { for (const p of all) p.yaPaso = false; pendientes = all; }
      pendientes[0].yaPaso = true;
      return pendientes[0].id;
    }
    const faltanPorPasar = t => teamPlayers(t, false).filter(p => !p.yaPaso).length;
    const reachedGoal = () => state.teams.A.score >= state.settings.points || state.teams.B.score >= state.settings.points;

    function startTurn() {
      const t = state.turnTeam;
      const psychicId = pickPsychic(t);
      if (!psychicId) {
        state.turnTeam = other(t);
        state.turn++;
        if (state.turn > 200) return finishGame();
        return startTurn();
      }
      state.psychicId = psychicId;
      state.teams[t].turnos = (state.teams[t].turnos || 0) + 1;
      state.round = Math.floor(state.turn / 2) + 1;
      state.needle = 90;
      state.lockedBy = null; state.counterBy = null;
      clearGuessTimer();
      state.deadline = null;
      state.clue = ''; state.votes = {}; state.counterChoice = null; state.result = null;
      drawCard();
      state.phase = 'psychic';
    }
    function quitarJugador(id) {
      if (!state.players[id]) return;
      log('salió:', state.players[id].name);
      delete state.players[id];
      if (id === state.psychicId && state.phase === 'psychic') startTurn();
    }
    function nextTurn() {
      if (reachedGoal()) return finishGame();
      state.turn++;
      state.turnTeam = other(state.turnTeam);
      startTurn();
    }
    function finishGame() { state.phase = 'finished'; state.psychicId = null; }
    function resolveCounter() {
      const t = state.turnTeam, o = other(t);
      const wedge = scoreFor(state.needle, state.target);
      const correctSide = state.target < state.needle ? 'izq' : 'der';
      const counterCorrect = wedge !== 4 && state.counterChoice === correctSide;
      const pts = { A: 0, B: 0 };
      pts[t] = wedge;
      if (counterCorrect) pts[o] = 1;
      state.teams.A.score += pts.A;
      state.teams.B.score += pts.B;
      state.result = { wedge, correctSide, counterCorrect, points: pts, needle: state.needle, target: state.target, lockedBy: state.lockedBy, counterBy: state.counterBy };
      state.history.push({ round: state.round, team: t, card: activeSide(), ...state.result });
      state.phase = 'reveal';
    }
    function startGame() {
      state.teams.A.score = 0; state.teams.B.score = 0;
      state.teams.A.turnos = 0; state.teams.B.turnos = 0;
      const first = Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      state.turn = 0; state.turnTeam = first ? first.team : 'A';
      state.history = [];
      startTurn();
    }

    // ---------- bots (partida de prueba) ----------
    function addBot(team) {
      if (team !== 'A' && team !== 'B') {
        const n = k => Object.values(state.players).filter(p => p.team === k).length;
        team = n('A') <= n('B') ? 'A' : 'B';
      }
      const usados = new Set(Object.values(state.players).map(p => p.name.toLowerCase()));
      let name = NOMBRES_BOT.find(n => !usados.has(n.toLowerCase()));
      for (let i = 2; !name; i++) name = NOMBRES_BOT.find(n => !usados.has((n + ' ' + i).toLowerCase())) + ' ' + i;
      const id = 'bot_' + uid();
      const ultimo = Math.max(0, ...Object.values(state.players).map(p => p.joinedAt || 0));
      state.players[id] = { id, name, team, connected: true, bot: true, joinedAt: Math.max(Date.now(), ultimo + 1) };
      return state.players[id];
    }
    const humanosConectados = (t, sinId) => Object.values(state.players).filter(p => p.team === t && !p.bot && p.connected && p.id !== sinId);
    const botsDe = (t, sinId) => teamPlayers(t).filter(p => p.bot && p.id !== sinId);
    const minus = s => (s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s);
    function pistaBot(lado, target) {
      const f = target / 180, izq = minus(lado.izquierda), der = minus(lado.derecha);
      const al = arr => arr[Math.floor(Math.random() * arr.length)];
      if (/\s/.test(izq + der)) {
        if (f < 0.1) return al([`100% ${izq}`, `${lado.izquierda}, sin duda`]);
        if (f < 0.25) return al([`Casi ${izq}`, `Muy cerca de ${izq}`]);
        if (f < 0.42) return al([`Tirándole a ${izq}`, `Más ${izq} que ${der}`]);
        if (f <= 0.58) return al([`Ni ${izq} ni ${der}`, 'Justo a la mitad']);
        if (f <= 0.75) return al([`Tirándole a ${der}`, `Más ${der} que ${izq}`]);
        if (f <= 0.9) return al([`Casi ${der}`, `Muy cerca de ${der}`]);
        return al([`100% ${der}`, `${lado.derecha}, sin duda`]);
      }
      if (f < 0.1) return al([`Lo más ${izq} que existe`, `Totalmente ${izq}`, `${lado.izquierda} al máximo`]);
      if (f < 0.25) return al([`Muy ${izq}`, `Bastante ${izq}`]);
      if (f < 0.42) return al([`Algo ${izq}`, `Un poco ${izq}`, `Tirándole a ${izq}`]);
      if (f <= 0.58) return al([`Ni ${izq} ni ${der}`, 'Justo a la mitad', `Entre ${izq} y ${der}`]);
      if (f <= 0.75) return al([`Algo ${der}`, `Un poco ${der}`, `Tirándole a ${der}`]);
      if (f <= 0.9) return al([`Muy ${der}`, `Bastante ${der}`]);
      return al([`Lo más ${der} que existe`, `Totalmente ${der}`, `${lado.derecha} al máximo`]);
    }
    function agujaBot() {
      const psi = state.players[state.psychicId];
      let a;
      if (psi && psi.bot && typeof state.target === 'number') {
        a = state.target + (Math.random() + Math.random() + Math.random() - 1.5) * 16;
      } else {
        const lado = activeSide() || {}, pista = (state.clue || '').toLowerCase();
        const tiene = s => s && pista.includes(String(s).toLowerCase());
        if (tiene(lado.izquierda) && !tiene(lado.derecha)) a = 25 + Math.random() * 45;
        else if (tiene(lado.derecha) && !tiene(lado.izquierda)) a = 110 + Math.random() * 45;
        else a = 30 + Math.random() * 120;
      }
      return Math.max(0, Math.min(180, Math.round(a * 10) / 10));
    }
    // Mientras se mueve la aguja solo viaja la posición, una vez para todos
    function avisarAguja() {
      const aviso = { type: 'needle', angle: state.needle };
      hostClient.send(aviso);
      opc.difundir(aviso);
    }
    function moverAguja(a) {
      state.needle = Math.max(0, Math.min(180, Math.round(a * 10) / 10));
      saveState();
      avisarAguja();
    }
    const claveRonda = () => [state.turn, state.psychicId, state.card ? state.card.lado1.izquierda + '|' + state.card.lado2.izquierda : '', state.side || ''].join(':');
    function accionPendiente() {
      const psi = state.players[state.psychicId];
      const t = state.turnTeam, o = other(t), k = claveRonda();
      if (state.phase === 'psychic' && psi && psi.bot) {
        if (!state.side) return { key: 'lado:' + k, ms: pausa(1500, 4000), run: () => { chooseSide(Math.random() < 0.5 ? 'lado1' : 'lado2'); } };
        return { key: 'pista:' + k, ms: pausa(2000, 4000), run: () => {
          state.clue = pistaBot(activeSide(), state.target);
          state.phase = 'guessing';
          state.deadline = Date.now() + GUESS_SECONDS * 1000;
          armGuessTimer();
        } };
      }
      if (state.phase === 'psychic' && psi && !psi.bot && !psi.connected) {
        if (!room.sinSenalDesde || room.sinSenalClave !== k) { room.sinSenalDesde = Date.now(); room.sinSenalClave = k; }
        return { key: 'sinsenal:' + k, ms: Math.max(0, room.sinSenalDesde + ESPERA_SIN_SENAL - Date.now()), run: () => {
          log('psíquico sin señal (' + psi.name + '): pasa el siguiente de su equipo');
          startTurn();
        } };
      }
      if (state.phase === 'guessing' && !humanosConectados(t, state.psychicId).length) {
        let quien = botsDe(t, state.psychicId);
        if (!quien.length && psi && psi.bot && teamPlayers(t).length <= 1) quien = [psi];
        if (!quien.length) return null;
        const g = room.botGuess && room.botGuess.k === k ? room.botGuess : (room.botGuess = { k, meta: agujaBot(), pasos: 2 + Math.floor(Math.random() * 2), hechos: 0 });
        if (g.hechos < g.pasos) return { key: 'aguja:' + g.hechos + ':' + k, ms: g.hechos ? pausa(700, 1600) : pausa(1500, 3500), run: () => {
          g.hechos++;
          const falta = g.pasos - g.hechos;
          moverAguja(falta ? g.meta + (Math.random() - 0.5) * 30 * falta : g.meta);
        }, soloAguja: true };
        const b = quien[Math.floor(Math.random() * quien.length)];
        return { key: 'listos:' + k, ms: pausa(1000, 2500), run: () => lockAnswer(b.name) };
      }
      if (state.phase === 'counter' && !humanosConectados(o).length) {
        const quien = botsDe(o);
        if (!quien.length) return null;
        const b = quien[Math.floor(Math.random() * quien.length)];
        return { key: 'voto:' + k, ms: pausa(1500, 4000), run: () => {
          const lado = Math.random() < 0.65 ? (state.needle < 90 ? 'der' : 'izq') : (state.needle < 90 ? 'izq' : 'der');
          state.votes[b.id] = lado; state.counterChoice = lado; state.counterBy = b.name;
          resolveCounter();
        } };
      }
      const sinHumanos = !Object.values(state.players).some(p => !p.bot && p.connected);
      if (state.phase === 'reveal' && ((psi && psi.bot) || (!psi && sinHumanos && Object.values(state.players).some(p => p.bot)))) {
        return { key: 'sig:' + k, ms: pausa(5000, 7000), run: () => nextTurn() };
      }
      return null;
    }
    function planBots() {
      const r = room;
      const a = accionPendiente();
      if (!a || !a.key.startsWith('sinsenal:')) r.sinSenalClave = null;
      if (!a) { if (r.botTimer) clearTimeout(r.botTimer); r.botTimer = null; r.botKey = null; r.botAt = null; return; }
      if (r.botKey === a.key && r.botTimer) return;
      if (r.botTimer) clearTimeout(r.botTimer);
      r.botKey = a.key; r.botAt = Date.now() + a.ms;
      r.botTimer = setTimeout(() => {
        r.botTimer = null; r.botKey = null; r.botAt = null;
        const ahora = accionPendiente();
        if (!ahora || ahora.key !== a.key) return planBots();
        ahora.run();
        if (ahora.soloAguja) planBots(); else broadcast();
      }, a.ms);
    }

    // ---------- cronómetro de la ronda ----------
    function clearGuessTimer() { if (room.guessTimer) { clearTimeout(room.guessTimer); room.guessTimer = null; } }
    function lockAnswer(quien) {
      clearGuessTimer();
      state.deadline = null;
      state.lockedBy = quien || 'el tiempo';
      state.votes = {};
      state.phase = 'counter';
    }
    function armGuessTimer() {
      clearGuessTimer();
      if (state.phase !== 'guessing') return;
      if (!state.deadline) state.deadline = Date.now() + GUESS_SECONDS * 1000;
      room.guessTimer = setTimeout(() => {
        room.guessTimer = null;
        if (state.phase !== 'guessing') return;
        lockAnswer('⏱ el tiempo');
        broadcast();
      }, Math.max(0, state.deadline - Date.now()));
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
        tally: tally(),
        voters,
        votedIds: Object.keys(state.votes),
        myVote: client.playerId ? state.votes[client.playerId] || null : null,
        counterChoice: state.counterChoice,
        result: state.result,
        history: state.history,
        wedge: WEDGE,
        decks: state.phase === 'lobby' ? listDecks() : undefined,
        remainingMs: state.phase === 'guessing' && state.deadline ? Math.max(0, state.deadline - Date.now()) : null,
        guessSeconds: GUESS_SECONDS,
        esperaPsiquicoMs: room.botKey && room.botKey.startsWith('sinsenal:') && room.botAt ? Math.max(0, room.botAt - Date.now()) : null,
        sala: room.code,
        joinUrl: opc.joinUrl(),
        me: client.playerId ? state.players[client.playerId] || null : null,
      };
    }
    function broadcast() {
      planBots();
      saveState();
      for (const c of clients()) c.send({ type: 'state', state: viewFor(c) });
    }

    // ---------- acciones ----------
    function handle(client, msg) {
      const { type } = msg;
      if (type === 'hello') {
        if (client.role === 'player' && msg.playerId && state.players[msg.playerId]) {
          client.playerId = msg.playerId;
          state.players[msg.playerId].connected = true;
        }
        return broadcast();
      }
      if (type === 'join') {
        const name = String(msg.name || '').trim().slice(0, 24);
        const team = msg.team === 'B' ? 'B' : 'A';
        if (!name) return;
        let id = client.playerId && state.players[client.playerId] ? client.playerId : (msg.playerId && state.players[msg.playerId] ? msg.playerId : null);
        if (!id) {
          // ¿Volvió alguien con el mismo nombre (otro celular, perdió el link)? Retoma su lugar.
          const mismo = Object.values(state.players).find(p => !p.bot && p.name.trim().toLowerCase() === name.toLowerCase());
          if (mismo) {
            for (const c of conns.values()) if (c !== client && c.playerId === mismo.id) {
              c.playerId = null;
              c.send({ type: 'kicked', message: `Alguien entró como "${mismo.name}" desde otro celular.` });
            }
            log('volvió a entrar:', mismo.name);
          }
          id = mismo ? mismo.id : uid();
        }
        if (!state.players[id]) state.players[id] = { id, joinedAt: Date.now() };
        const conserva = state.phase !== 'lobby' && state.players[id].team;
        const yaEstaba = state.players[id].name;
        Object.assign(state.players[id], { name: yaEstaba && yaEstaba.toLowerCase() === name.toLowerCase() ? yaEstaba : name, team: conserva || team, connected: true });
        client.playerId = id;
        client.send({ type: 'joined', playerId: id });
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

      if (type === 'redraw' && isPsychic && state.phase === 'psychic' && !state.side) { drawCard(); return broadcast(); }
      if (type === 'chooseSide' && isPsychic && state.phase === 'psychic' && !state.side) {
        if (msg.side !== 'lado1' && msg.side !== 'lado2') return;
        chooseSide(msg.side);
        return broadcast();
      }
      if (type === 'beginGuess' && isPsychic && state.phase === 'psychic' && state.side) {
        state.clue = String(msg.clue || '').trim().slice(0, 200);
        state.phase = 'guessing';
        state.deadline = Date.now() + GUESS_SECONDS * 1000;
        armGuessTimer();
        return broadcast();
      }
      if (type === 'needle' && state.phase === 'guessing' && isActiveTeam) {
        if (isPsychic && teamPlayers(state.turnTeam).length > 1) return;
        const a = Number(msg.angle);
        if (!Number.isFinite(a)) return;
        return moverAguja(a);
      }
      if (type === 'lock' && state.phase === 'guessing' && isActiveTeam) {
        if (isPsychic && teamPlayers(state.turnTeam).length > 1) return;
        lockAnswer(me.name);
        return broadcast();
      }
      if (type === 'vote' && state.phase === 'counter' && isOtherTeam) {
        if (msg.side !== 'izq' && msg.side !== 'der') return;
        state.votes[me.id] = msg.side;
        state.counterChoice = msg.side;
        state.counterBy = me.name;
        resolveCounter();
        return broadcast();
      }
      const psi = state.players[state.psychicId];
      const sinPsiquico = !psi || (!psi.bot && !psi.connected);
      if (type === 'next' && state.phase === 'reveal' && (client.role === 'host' || isPsychic || (me && sinPsiquico))) {
        nextTurn();
        return broadcast();
      }

      // ----- solo la tele -----
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
        startGame();
        return broadcast();
      }
      if (type === 'addBot' && state.phase !== 'finished') {
        if (Object.keys(state.players).length >= 24) return;
        addBot(msg.team);
        return broadcast();
      }
      if (type === 'testGame' && state.phase === 'lobby') {
        for (const k of ['A', 'B']) while (teamPlayers(k).length < 3) addBot(k);
        log('PARTIDA DE PRUEBA con bots');
        startGame();
        return broadcast();
      }
      if (type === 'forceCounter' && state.phase === 'counter') {
        if (msg.side !== 'izq' && msg.side !== 'der') return;
        state.counterChoice = msg.side;
        resolveCounter();
        return broadcast();
      }
      if (type === 'repeatTurn' && ['psychic', 'guessing', 'counter', 'reveal'].includes(state.phase)) {
        if (state.phase === 'reveal' && state.result) {
          state.teams.A.score -= state.result.points.A;
          state.teams.B.score -= state.result.points.B;
          state.history.pop();
        }
        const mismoPsiquico = state.psychicId;
        clearGuessTimer();
        state.deadline = null; state.needle = 90;
        state.lockedBy = null; state.counterBy = null;
        state.clue = ''; state.votes = {}; state.counterChoice = null; state.result = null;
        drawCard();
        state.psychicId = mismoPsiquico;
        state.phase = 'psychic';
        return broadcast();
      }
      if (type === 'skipTurn' && ['psychic', 'guessing', 'counter'].includes(state.phase)) { startTurn(); return broadcast(); }
      if (type === 'endGame' && ['psychic', 'guessing', 'counter', 'reveal'].includes(state.phase)) {
        clearGuessTimer();
        state.deadline = null;
        finishGame();
        return broadcast();
      }
      if (type === 'kick' && msg.playerId) {
        quitarJugador(msg.playerId);
        for (const c of conns.values()) if (c.playerId === msg.playerId) { c.playerId = null; c.send({ type: 'kicked' }); }
        return broadcast();
      }
      if (type === 'reset') {
        clearGuessTimer();
        state = freshState(true);
        return broadcast();
      }
    }

    // Un celular dejó de dar señales: igual que cuando antes se cerraba su WebSocket
    function cerrar(c) {
      conns.delete(c.conn);
      if (c.playerId && state.players[c.playerId]) {
        const still = [...conns.values()].some(x => x.playerId === c.playerId);
        if (!still) state.players[c.playerId].connected = false;
      }
      broadcast();
    }

    // al arrancar: si se recuperó una ronda a medias, el reloj sigue y los bots retoman lo suyo
    setTimeout(() => { armGuessTimer(); broadcast(); }, 0);

    return {
      host(msg) { try { handle(hostClient, msg); } catch (e) { console.error(e); } },
      // Todo lo que manda un celular trae su conn (y su playerId guardado). El primer mensaje de
      // una conexión nueva cuenta como 'hello' (por ejemplo, si la tele se recargó).
      celular(conn, msg) {
        conn = String(conn || '').slice(0, 40);
        if (!conn) return;
        let c = conns.get(conn);
        const nueva = !c;
        if (nueva) {
          c = { conn, role: 'player', playerId: null, visto: 0, send: m => opc.enviarA(conn, m) };
          conns.set(conn, c);
        }
        c.visto = Date.now();
        try {
          if (nueva && msg.type !== 'hello') handle(c, { type: 'hello', playerId: msg.playerId });
          if (msg.type === 'latido') {
            // volvió la señal de alguien que se había marcado sin señal
            if (c.playerId && state.players[c.playerId] && !state.players[c.playerId].connected) { state.players[c.playerId].connected = true; broadcast(); }
            return;
          }
          handle(c, msg);
        } catch (e) { console.error(e); }
      },
      revisarSenal() {
        for (const c of [...conns.values()]) if (Date.now() - c.visto > SIN_SENAL_MS) cerrar(c);
      },
    };
  }

  return { crear };
})();
