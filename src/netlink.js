// ======================================================================
// Twee spelers via internet aan elkaar koppelen (multiplayer.js gebruikt dit)
// ======================================================================
// Computers kunnen direct met elkaar praten (dat heet WebRTC), maar eerst moeten ze elkaar vinden.
// Daar is een "tussenpersoon" voor nodig: een server op internet waar je zegt "ik zit in kamer MUNT-7K3P".
// Vroeger hadden we er maar één (de PeerJS-server). Deed die het even niet, of blokkeerde jullie netwerk hem,
// dan kon je niet samen spelen. Nu proberen we DRIE manieren tegelijk:
//   - PeerJS:  de gratis PeerJS-server
//   - Nostr:   openbare Nostr-servers (via de bibliotheek Trystero)
//   - Torrent: openbare WebTorrent-trackers (ook via Trystero)
// De eerste die werkt, gebruiken we. Lukt er nog een? Die bewaren we als reserve: valt de ene weg,
// dan gaat het spel via de andere gewoon verder.
// Lukt direct verbinden niet (sommige netwerken laten dat niet toe)? Dan gaat het via een TURN-server (een doorgeefluik).
//
// Testen met eigen servers: ?peer=localhost:9000  ?nostr=ws://localhost:7000  ?tracker=ws://localhost:8000
// Maar een paar manieren proberen: ?via=peerjs  of  ?via=nostr,torrent   (en ?ice=lokaal: geen STUN/TURN)

const PREFIX = 'munt-jager-3d-'; // PeerJS: de kamer van MUNT-7K3P heet munt-jager-3d-7K3P
const APP_ID = 'munt-jager-3d'; // Trystero: de kamer heet kamer-7K3P
export const PROTO = 2; // versie van de berichten (verschillend? dan heeft één van jullie een oude versie van het spel)
export const WAYS = { peerjs: 'PeerJS', nostr: 'Nostr', torrent: 'Torrent' };
const GRACE = 6; // valt de verbinding weg? Dan wachten we zo lang (seconden) of hij terugkomt
const GIVE_UP = 30; // na zoveel seconden zoeken geeft de meedoener het op
const WHO_WAIT = 8; // een nieuwe verbinding moet binnen zoveel seconden zeggen wie hij is
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
// De gratis TURN-servers van PeerJS (staan ook standaard in PeerJS zelf)
const TURN = [{
  urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478', 'turn:eu-0.turn.peerjs.com:3478?transport=tcp', 'turn:us-0.turn.peerjs.com:3478?transport=tcp'],
  username: 'peerjs',
  credential: 'peerjsp',
}];

const params = new URLSearchParams(location.search);
const iceServers = () => (params.get('ice') === 'lokaal' ? [] : [...STUN, ...TURN]);

/** De instellingen in de adresbalk die ook in een deel-link horen (alleen om te testen). */
export const TEST_PARAMS = ['peer', 'nostr', 'tracker', 'via', 'ice'];

/** PeerJS laden (alleen als je samen wilt spelen). */
let peerLib = null;
function loadPeerJS() {
  if (window.peerjs) return Promise.resolve(window.peerjs);
  peerLib ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'lib/peerjs.min.js';
    s.onload = () => (window.peerjs ? resolve(window.peerjs) : reject(new Error('PeerJS niet gevonden')));
    s.onerror = () => {
      peerLib = null; // (de volgende keer opnieuw proberen)
      s.remove();
      reject(new Error('Kon lib/peerjs.min.js niet laden'));
    };
    document.head.appendChild(s);
  });
  return peerLib;
}

/** Trystero laden (Nostr en Torrent). */
let trysteroLib = null;
function loadTrystero() {
  trysteroLib ??= import('../lib/trystero.min.js').catch((e) => {
    trysteroLib = null;
    throw e;
  });
  return trysteroLib;
}

/** Instellingen voor PeerJS (?peer=host:poort om een eigen server te gebruiken). */
function peerOptions() {
  const options = { debug: 0, config: { iceServers: iceServers() } };
  const custom = params.get('peer');
  if (!custom) return options;
  const [host, port] = custom.split(':');
  return { ...options, host, port: Number(port) || 9000, path: '/', secure: false };
}

export class FriendLink {
  /**
   * @param {string} code  de kamercode (4 tekens)
   * @param {boolean} host  true = jij hebt de kamer gemaakt, false = jij doet mee met de code van je vriend
   * @param {object} on  { open(), message(msg), close(), fail(type), change(), codeTaken() }
   */
  constructor(code, host, on) {
    this.code = code;
    this.host = host;
    this.on = on;
    this.me = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; // wie ben ik (per keer anders)
    const via = params.get('via')?.split(',').filter((k) => k in WAYS);
    this.ways = {}; // per manier: kan hij zijn server bereiken? 'bezig' | 'klaar' | 'mislukt'
    for (const key of via?.length ? via : Object.keys(WAYS)) this.ways[key] = 'bezig';
    this.links = new Set(); // alle verbindingen die open zijn (ook die nog moeten zeggen wie ze zijn)
    this.active = null; // via deze verbinding sturen we
    this.friend = null; // wie je vriend is (uit het 'ik'-bericht)
    this.connected = false; // samen aan het spelen (open() is gebeurd)
    this.closed = false;
    this.started = performance.now();
    this.graceUntil = 0;
    this.sawFriend = false; // jullie vonden elkaar wel, maar de verbinding lukte niet
    this.peer = null;
    this.peerOpen = false;
    this.peerEverOpen = false; // (dan is de code echt van ons)
    this.dialing = null; // { conn, gone }
    this.dialTimer = 0;
    this.peerRetry = 0;
    this.peerTimer = 0;
    this.rooms = [];
    this.roomKeys = new Set(); // de manieren van Trystero die echt begonnen zijn
    this.lib = null;
    // Tabblad dicht? Dan nog snel "doei" zeggen
    this.onPageHide = () => this.bye();
    addEventListener('beforeunload', this.onPageHide);
    addEventListener('pagehide', this.onPageHide);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /** Alle manieren tegelijk beginnen. */
  start() {
    if (typeof RTCPeerConnection === 'undefined') {
      this.fail('browser');
      return;
    }
    if (this.ways.peerjs) this.startPeerJS();
    if (this.ways.nostr) this.startTrystero('nostr');
    if (this.ways.torrent) this.startTrystero('torrent');
  }

  /** Is er nu een verbinding om berichten over te sturen? */
  get open() {
    return !this.closed && !!this.active;
  }

  /** Via welke manier praten jullie nu? (en hoeveel reserve-verbindingen zijn er) */
  get via() {
    return this.active ? WAYS[this.active.via] : null;
  }

  get spare() {
    let n = 0;
    for (const l of this.links) if (l.ok && l !== this.active && l.friend === this.friend) n++;
    return n;
  }

  /** Hoe het met elke manier gaat (voor in het menu): [{ name, state: 'bezig' | 'klaar' | 'verbonden' | 'mislukt' }] */
  get status() {
    return Object.entries(this.ways).map(([key, state]) => {
      for (const l of this.links) if (l.ok && l.via === key) return { name: WAYS[key], state: 'verbonden' };
      return { name: WAYS[key], state };
    });
  }

  /** Hoe lang zijn we al aan het zoeken (seconden)? */
  get seconds() {
    return Math.floor((performance.now() - this.started) / 1000);
  }

  send(msg) {
    this.active?.send(msg);
  }

  /** Stoppen (je vriend krijgt nog even een "doei", en weet dan meteen dat je weg bent). */
  close() {
    if (this.closed) return;
    this.bye();
    this.closed = true;
    clearInterval(this.timer);
    clearTimeout(this.dialTimer);
    clearTimeout(this.peerTimer);
    removeEventListener('beforeunload', this.onPageHide);
    removeEventListener('pagehide', this.onPageHide);
    const links = [...this.links];
    const peer = this.peer;
    this.links.clear();
    this.active = null;
    this.peer = null;
    // Trystero: meteen de kamers uit (Trystero zegt zelf ook nog doei, en ruimt pas daarna op).
    // Meteen, want doe je daarna weer mee met dezelfde code, dan moet dat een nieuwe kamer zijn.
    for (const room of this.rooms) room.leave().catch(() => {});
    this.rooms = [];
    // PeerJS: heel even wachten, anders komt de "doei" niet meer aan
    setTimeout(() => {
      for (const l of links) l.close();
      try {
        peer?.destroy();
      } catch {
        // al weg
      }
    }, 300);
  }

  /** Jouw vriend is weg: (als je de kamer gemaakt hebt) weer wachten op een nieuwe vriend, met dezelfde code. */
  reset() {
    this.started = performance.now();
    this.sawFriend = false;
  }

  // ---------------- De verbindingen ----------------

  /** Er is een nieuwe verbinding open (via een van de manieren). */
  addLink(link) {
    if (this.closed) {
      link.close();
      return;
    }
    link.ok = false;
    link.friend = null;
    link.waiting = []; // berichten die binnenkwamen voordat we wisten van wie ze zijn
    link.since = performance.now();
    this.links.add(link);
    link.send({ t: 'ik', id: this.me, host: this.host, v: PROTO });
    // Bij PeerJS kan alleen iemand die jouw code weet bellen: die mag meteen (ook een oudere versie van het spel,
    // die nog niet zegt wie het is). Bij de andere manieren wachten we eerst op het 'ik'-bericht.
    if (link.via === 'peerjs' && !this.active && !this.friend) this.use(link);
    this.changed();
  }

  /** Een verbinding is dicht. */
  unlink(link) {
    if (!this.links.delete(link)) return;
    if (this.active === link) {
      this.active = null;
      const spare = [...this.links].find((l) => l.ok && l.friend && l.friend === this.friend);
      if (spare) this.use(spare);
      else if (this.connected) {
        // Even wachten: misschien komt hij terug (via dezelfde of een andere manier)
        this.graceUntil = performance.now() + GRACE * 1000;
        this.dial();
      }
    }
    this.changed();
  }

  /** Deze verbinding willen we niet (een vreemde). later = eerst nog even een bericht laten aankomen. */
  drop(link, later = false) {
    this.unlink(link);
    if (later) setTimeout(() => link.close(), 500);
    else link.close();
  }

  /** Vanaf nu via deze verbinding. */
  use(link) {
    this.active = link;
    this.graceUntil = 0;
    if (link.friend) this.friend = link.friend;
    if (!this.connected) {
      this.connected = true;
      this.on.open();
    }
    this.accept(link);
  }

  /** Deze verbinding is echt van je vriend: nu mogen de berichten erdoor. */
  accept(link) {
    link.ok = true;
    const waiting = link.waiting ?? [];
    link.waiting = [];
    for (const msg of waiting) if (this.links.has(link)) this.on.message(msg);
    this.changed();
  }

  /** Er komt een bericht binnen via een van de verbindingen. */
  receive(link, msg) {
    if (this.closed || !this.links.has(link) || !msg || typeof msg !== 'object') return;
    if (msg.t === 'ik') {
      link.friend = String(msg.id);
      link.host = !!msg.host;
      this.check(link);
      // Weten we nu wie je vriend is? Dan mogen de verbindingen die daarop wachtten ook
      if (link === this.active) for (const l of [...this.links]) if (!l.ok && l.friend) this.check(l);
      return;
    }
    if (msg.t === 'doei') {
      if (link.ok && link.friend === this.friend) this.lose();
      return;
    }
    if (msg.t === 'vol') {
      // De kamermaker speelt al met iemand anders (en als je al dacht dat je erbij was: dan toch niet)
      if (!this.host && (!this.connected || link.friend === this.friend)) this.fail('vol');
      return;
    }
    if (link.ok) this.on.message(msg);
    else if (link.waiting.length < 50) link.waiting.push(msg);
  }

  /** Mag deze verbinding meedoen? (Is het echt je vriend?) */
  check(link) {
    if (link.ok && link !== this.active) return;
    // Twee kamermakers (of twee meedoeners) met dezelfde code: die horen niet bij elkaar
    if (link.host === this.host) {
      this.drop(link);
      return;
    }
    const current = this.active;
    if (current && current !== link) {
      if (!current.friend) return; // eerst weten wie je huidige vriend is (dan kijken we nog eens)
      if (current.friend !== link.friend) {
        link.send({ t: 'vol' }); // je speelt al met iemand anders
        this.drop(link, true);
        return;
      }
      this.accept(link); // je vriend, via nog een manier: reserve
      return;
    }
    if (current === link) {
      this.friend = link.friend;
      return;
    }
    // Geen verbinding (meer)? Was er net nog een andere vriend? Dan is die weg, en is dit iemand nieuws
    if (this.friend && this.friend !== link.friend) {
      this.links.delete(link);
      this.lose();
      if (this.closed) {
        link.close();
        return;
      }
      this.links.add(link);
    }
    this.use(link);
  }

  /** De verbinding met je vriend is weg. */
  lose() {
    const was = this.connected;
    this.connected = false;
    this.active = null;
    this.friend = null;
    this.graceUntil = 0;
    for (const l of [...this.links]) this.drop(l);
    if (was) this.on.close();
  }

  /** Zeg "doei" tegen je vriend (als je stopt of het tabblad dichtdoet). */
  bye() {
    if (this.closed) return;
    for (const l of this.links) {
      if (!l.ok || l.saidBye) continue;
      l.saidBye = true;
      l.send({ t: 'doei' });
    }
  }

  /** Mislukt: niemand gevonden, kamer vol, enzovoort. */
  fail(type) {
    if (this.closed) return;
    this.close();
    this.on.fail(type);
  }

  changed() {
    if (!this.closed) this.on.change?.();
  }

  /** Elke seconde: hoe gaat het? */
  tick() {
    if (this.closed) return;
    const now = performance.now();
    // Kan Trystero zijn servers bereiken?
    if (this.lib) {
      for (const key of this.roomKeys) {
        const sockets = Object.values(key === 'nostr' ? this.lib.nostrSockets() : this.lib.torrentSockets());
        const up = sockets.some((s) => s.readyState === 1);
        this.ways[key] = up ? 'klaar' : this.seconds > 12 ? 'mislukt' : 'bezig';
      }
    }
    // Verbindingen die niet zeggen wie ze zijn, doen niet mee
    for (const l of [...this.links]) {
      if (!l.ok && now - l.since > WHO_WAIT * 1000) this.drop(l);
    }
    if (this.graceUntil && now > this.graceUntil) this.lose();
    if (this.closed) return;
    if (!this.connected && !this.host) {
      // De meedoener zoekt niet eeuwig
      const allFailed = Object.values(this.ways).every((s) => s === 'mislukt');
      if (this.seconds >= GIVE_UP) this.fail(this.sawFriend ? 'netwerk' : 'niemand');
      else if (allFailed && this.seconds >= 10) this.fail('offline');
      if (this.closed) return;
    }
    if (!this.connected || !this.active) this.changed(); // (de seconden in het menu)
  }

  // ---------------- Manier 1: PeerJS ----------------

  async startPeerJS() {
    let Peer;
    try {
      ({ Peer } = await loadPeerJS());
    } catch {
      this.ways.peerjs = 'mislukt';
      this.changed();
      return;
    }
    if (this.closed) return;
    // De kamermaker gebruikt de code als naam, de meedoener krijgt een willekeurige naam en belt de kamermaker
    const peer = new Peer(this.host ? PREFIX + this.code : undefined, peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      if (this.peer !== peer) return;
      this.peerOpen = true;
      this.peerEverOpen = true;
      this.peerRetry = 0;
      this.ways.peerjs = 'klaar';
      this.changed();
      this.dial();
    });
    peer.on('connection', (conn) => {
      if (this.peer !== peer) return;
      this.sawFriend = true;
      this.peerConn(conn);
    });
    peer.on('disconnected', () => {
      if (this.peer !== peer) return;
      this.peerOpen = false;
      this.retryPeerJS();
    });
    peer.on('error', (e) => {
      if (this.peer !== peer || this.closed) return;
      const type = e?.type;
      if (type === 'peer-unavailable') {
        // De kamermaker staat (nog) niet bij PeerJS: ophangen en straks nog eens bellen
        const call = this.dialing;
        this.dialing = null;
        call?.gone(false);
        call?.conn.close();
        this.dialLater();
      } else if (type === 'unavailable-id' && !this.peerEverOpen) {
        // Iemand anders heeft deze code al: een nieuwe code maken (als er nog niemand meedoet)
        this.ways.peerjs = 'mislukt';
        this.changed();
        if (!this.connected) this.on.codeTaken?.();
      } else if (type === 'browser-incompatible') {
        this.fail('browser');
      } else {
        // Geen verbinding met de PeerJS-server (geblokkeerd, even kapot...): straks opnieuw
        this.ways.peerjs = 'mislukt';
        this.changed();
        this.retryPeerJS();
      }
    });
  }

  /** De PeerJS-server is weg: over een paar seconden opnieuw proberen (steeds iets langer wachten). */
  retryPeerJS() {
    if (this.closed || this.peerTimer) return;
    const wait = Math.min(30, 3 * 2 ** this.peerRetry++);
    this.peerTimer = setTimeout(() => {
      this.peerTimer = 0;
      const peer = this.peer;
      if (this.closed || !peer) return;
      if (peer.destroyed) {
        this.peer = null;
        this.dialing = null;
        this.startPeerJS();
      } else if (peer.disconnected) {
        try {
          peer.reconnect();
        } catch {
          this.retryPeerJS();
        }
      }
    }, wait * 1000);
  }

  /** Meedoener: de kamermaker bellen via PeerJS. */
  dial() {
    if (this.closed || this.host || !this.peer || !this.peerOpen || this.dialing) return;
    if (this.active) return; // al verbonden
    for (const l of this.links) if (l.via === 'peerjs') return;
    let conn;
    try {
      conn = this.peer.connect(PREFIX + this.code, { serialization: 'json', reliable: true });
    } catch {
      this.dialLater();
      return;
    }
    if (!conn) {
      this.dialLater();
      return;
    }
    this.dialing = { conn, gone: this.peerConn(conn) };
  }

  dialLater(seconds = 3) {
    if (this.closed || this.host || this.dialTimer) return;
    this.dialTimer = setTimeout(() => {
      this.dialTimer = 0;
      this.dial();
    }, seconds * 1000);
  }

  /** Een PeerJS-verbinding (gebeld of opgenomen). Geeft terug: ophangen. */
  peerConn(conn) {
    let link = null;
    let done = false;
    // Gaat hij niet open? Dan na 15 seconden ophangen (en de meedoener belt opnieuw)
    const timeout = setTimeout(() => {
      if (!link) {
        gone(true); // (jullie vonden elkaar wel, maar verbinden lukte niet)
        conn.close();
      }
    }, 15000);
    const gone = (found = false) => {
      if (done) return;
      done = true;
      if (found) this.sawFriend = true;
      clearTimeout(timeout);
      if (this.dialing?.conn === conn) this.dialing = null;
      if (link) this.unlink(link);
      this.dialLater();
    };
    conn.on('open', () => {
      clearTimeout(timeout);
      if (this.closed || done) {
        conn.close();
        return;
      }
      link = {
        via: 'peerjs',
        send: (msg) => {
          try {
            if (conn.open) conn.send(msg);
          } catch {
            // dicht
          }
        },
        close: () => conn.close(),
      };
      this.addLink(link);
    });
    conn.on('data', (msg) => {
      if (link) this.receive(link, msg);
    });
    conn.on('close', () => gone());
    conn.on('error', () => gone(true));
    return gone;
  }

  // ---------------- Manier 2 en 3: Nostr en Torrent (via Trystero) ----------------

  async startTrystero(key) {
    let lib;
    try {
      lib = await loadTrystero();
    } catch {
      this.ways[key] = 'mislukt';
      this.changed();
      return;
    }
    if (this.closed) return;
    this.lib = lib;
    const urls = params.get(key === 'nostr' ? 'nostr' : 'tracker');
    const config = {
      appId: APP_ID,
      // Nostr: 10 van de openbare servers (iedereen kiest dezelfde), Torrent: alle 5 de trackers
      relayConfig: urls ? { urls: urls.split(','), warnOnRelayFailure: false } : { redundancy: key === 'nostr' ? 10 : 5, warnOnRelayFailure: false },
      rtcConfig: { iceServers: iceServers() },
    };
    let room;
    try {
      room = (key === 'nostr' ? lib.joinNostr : lib.joinTorrent)(config, `kamer-${this.code}`, {
        onJoinError: (e) => {
          if (/after exchanging SDP/.test(e?.error ?? '')) this.sawFriend = true;
        },
      });
    } catch {
      this.ways[key] = 'mislukt';
      this.changed();
      return;
    }
    this.rooms.push(room);
    this.roomKeys.add(key);
    const action = room.makeAction('spel');
    const peers = new Map(); // id van de andere computer → onze verbinding
    const linkFor = (id) => {
      let link = peers.get(id);
      if (!link) {
        link = {
          via: key,
          send: (msg) => action.send(msg, { target: id }).catch(() => {}),
          // (Niet zelf ophangen: dan denkt Trystero dat hij nog verbonden is, en lukt opnieuw meedoen niet.
          // We luisteren er gewoon niet meer naar. Een vreemde krijgt 'vol' en gaat dan zelf weg.)
          close: () => {},
        };
        peers.set(id, link);
        this.addLink(link);
      }
      return link;
    };
    room.onPeerJoin = (id) => {
      const old = peers.get(id);
      if (old) {
        peers.delete(id);
        this.unlink(old);
      }
      linkFor(id).pc = room.getPeers()[id] ?? null;
    };
    room.onPeerLeave = (id) => {
      const link = peers.get(id);
      peers.delete(id);
      if (!link) return;
      // Is de verbinding zelf nog helemaal goed? Dan ging je vriend echt weg (net als "doei").
      // (Bij een tabblad dat dichtgaat komt ons eigen "doei" via Trystero niet altijd meer aan.)
      if (link === this.active && link.pc?.connectionState === 'connected') this.lose();
      else this.unlink(link);
    };
    action.onMessage = (msg, { peerId }) => {
      if (!this.closed) this.receive(linkFor(peerId), msg);
    };
  }
}
