const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const zoom = document.getElementById('zoom');
const nemesisBtn = document.getElementById('nemesis-btn');
const resolveBtn = document.getElementById('resolve-btn');
const controls = document.querySelector('.controls');
const infoRow = document.getElementById('info-row');
const turnInfo = document.getElementById('turn-info');
const discardBtn = document.getElementById('discard-btn');
const discardLayer = document.getElementById('discard');
const discardTitle = document.getElementById('discard-title');
const discardGrid = document.getElementById('discard-grid');
const discardClose = document.getElementById('discard-close');
const menuBtn = document.getElementById('menu-btn');
const startLayer = document.getElementById('start');
const startBtn = document.getElementById('start-btn');
const resumeBtn = document.getElementById('resume-btn');
const startError = document.getElementById('start-error');
const undoBtn = document.getElementById('undo-btn');
const phaseLabel = document.getElementById('phase-label');

// Rapporto carta standard: 63 x 88 mm
const CARD_RATIO = 88 / 63;

// Oltre questo numero di carte la dimensione resta fissa e si scorre di lato
const MAX_VISIBLE = 5;

// Distanza minima (px) di uno slide per cambiare carta in VistaRisoluzione
const SWIPE_MIN_DISTANCE = 50;

// Spazio sopra ogni carta (in coda e ingrandita) per token (potere) e gocce di vita (minion): un'unica fila alta al
// massimo PIPS_ROW_RATIO x larghezza carta, più PIPS_SPACE_EXTRA px (devono corrispondere a .pips / .pip / .drop in style.css)
const PIPS_ROW_RATIO = 0.182;
const PIPS_SPACE_EXTRA = 6;

// Valore in punti vita della goccia grande (la piccola vale 1)
const DROP_BIG_VALUE = 5;

// Spazio (px) tra gli elementi della VistaCartaCoda (carta, pulsanti): lo stesso di #zoom in style.css
const ZOOM_GAP = 12;

// Partita salvata nel browser (localStorage) e numero massimo di passi di undo conservati
const SAVE_KEY = 'aeonsend-save-v1';
const UNDO_LIMIT = 300;

// Tutte le carte (cards.json, generato da cards.csv con tools/build-cards.ps1) e la tabella
// Nemesis Deck Setup (deck-setup.json), lette all'avvio
let allCards = [];
let cardsById = new Map();
let deckSetup = null;
// Boss con wave, mini espansione e battaglia (nemesis.json, da tools/nemeses.csv)
let nemeses = [];

// Scelte della pagina iniziale: giocatori, nemesi (da cui dipende la battaglia) e se usare le Upgraded Basic
let settings = { players: 2, nemesis: null, includeUpgraded: true };
let startOptions = null;

// Stato della VistaRisoluzione (false = VistaCoda)
let resolving = false;
// Carta da risolvere (glow rosso): cambia solo con il pulsante principale
let currentIndex = 0;
// Carta mostrata ingrandita (glow bianco): cambia anche con lo slide o toccando la fascia, senza risolvere nulla
let viewIndex = 0;
// Indice della carta appena pescata alla fine della risoluzione (-1 = nessuna)
let newIndex = -1;
// La prossima volta che si mostra la carta appena pescata, entra girandosi
let flipPending = false;

// Mazzo nemesi (si pesca dalla fine), pila degli scarti e numero di turni nemesi giocati
let deck = [];
let discard = [];
let turn = 0;

// Undo: uno stato della partita salvato prima di ogni azione
let undoStack = [];

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Impossibile leggere ' + path + ' (' + res.status + ')');
  return res.json();
}

function queueCards() {
  return Array.from(canvas.querySelectorAll('.card'));
}

function shuffle(cards) {
  const result = cards.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// n carte a caso dalla lista
function pickRandom(cards, n) {
  return shuffle(cards).slice(0, n);
}

// La battaglia dipende dal boss scelto (colonna Expedition Battle di nemesis.json)
function battleOf(nemesisName) {
  const info = nemeses.find(n => n.name === nemesisName);
  return info ? info.battle : null;
}

// Un boss si può scegliere solo se ha una battaglia e le sue carte sono nel progetto
function isPlayable(info) {
  return info.battle !== null && allCards.some(c => c.category === 'Specific' && c.nemesis === info.name);
}

// Mazzo per la battaglia del boss scelto (Nemesis Deck Setup): per ogni Tier si estraggono a caso le carte base e
// potenziate indicate nella tabella e si aggiungono le carte specifiche del nemico di quel Tier.
// Senza "Include Upgraded Basic" al posto delle potenziate si prendono altrettante carte base diverse, dello stesso
// Tier: il numero di carte resta uguale.
// Ogni Tier è mescolato a parte; si pesca dalla fine, quindi in cima c'è il Tier 1 e in fondo il Tier 3.
// Restano fuori le carte senza Tier (World Devourer, Rending Claw) e la maledizione dei giocatori.
function buildDeck() {
  const battle = deckSetup.battles.find(b => b.battle === battleOf(settings.nemesis));
  const setup = battle.players[String(settings.players)];
  const result = [];
  [3, 2, 1].forEach(tier => {
    const ofTier = c => c.tier === tier && c.type !== 'Curse';
    const basicCount = setup.basic[tier] + (settings.includeUpgraded ? 0 : setup.upgradedBasic[tier]);
    const upgradedCount = settings.includeUpgraded ? setup.upgradedBasic[tier] : 0;
    const group = [
      ...pickRandom(allCards.filter(c => c.category === 'Basic Nemesis' && ofTier(c)), basicCount),
      ...pickRandom(allCards.filter(c => c.category === 'Upgraded Basic Nemesis' && ofTier(c)), upgradedCount),
      ...allCards.filter(c => c.category === 'Specific' && c.nemesis === settings.nemesis && ofTier(c))
    ];
    result.push(...shuffle(group));
  });
  return result;
}

// Nuova partita: mazzo nuovo per le scelte correnti, scarti vuoti, turni a zero
function newGame() {
  deck = buildDeck();
  discard = [];
  turn = 0;
  updateInfo();
}

// Pesca la carta in cima al mazzo; se il mazzo è finito si rimescolano gli scarti. Null se non c'è niente da pescare.
function drawFromDeck() {
  if (deck.length === 0 && discard.length > 0) {
    deck = shuffle(discard);
    discard = [];
  }
  const data = deck.pop() || null;
  updateInfo();
  return data;
}

// Toglie la carta dalla coda e la mette nella pila degli scarti; al suo posto resta per un attimo una copia che svanisce
function discardCard(card) {
  discard.push(card.state.data);
  fadeOutCopy(card);
  card.remove();
  updateInfo();
}

// Copia della carta, ferma nel punto in cui era, che passa da opaca a trasparente e poi sparisce
function fadeOutCopy(card) {
  const rect = card.getBoundingClientRect();
  if (!rect.width) return;
  const ghost = card.cloneNode(true);
  ghost.classList.remove('viewed', 'to-resolve');
  ghost.classList.add('discard-ghost');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: rect.left + 'px',
    top: rect.top + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
    margin: '0'
  });
  document.body.appendChild(ghost);
  ghost.addEventListener('animationend', () => ghost.remove());
  // Se l'animazione non parte (per esempio pagina in background), la copia sparisce comunque
  setTimeout(() => ghost.remove(), 1000);
}

function updateInfo() {
  turnInfo.textContent = 'Turno ' + turn + ' · Mazzo ' + deck.length;
  discardBtn.textContent = 'Scarti (' + discard.length + ')';
}

function layout() {
  const cards = queueCards();
  const n = cards.length;

  if (n === 0) {
    canvas.style.padding = '0';
    canvas.style.gap = '0';
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;

  // Margine dal bordo del canvas; lo spazio tra le carte è la metà di questo
  const margin = Math.min(W, H) * 0.05;
  const gap = margin / 2;

  // La dimensione si calcola al massimo su MAX_VISIBLE carte: dopo si scorre
  const fit = Math.min(n, MAX_VISIBLE);

  // Larghezza massima se limitati dallo spazio orizzontale
  const availW = W - 2 * margin - (fit - 1) * gap;
  const widthFromWidth = availW / fit;

  // Larghezza massima se limitati dallo spazio verticale: sopra la carta si lascia lo spazio per token e gocce
  const availH = H - 2 * margin;
  const widthFromHeight = Math.max(0, availH - PIPS_SPACE_EXTRA) / (CARD_RATIO + PIPS_ROW_RATIO);

  const cardWidth = Math.max(0, Math.min(widthFromWidth, widthFromHeight));
  const cardHeight = cardWidth * CARD_RATIO;
  const pipsSpace = cardWidth * PIPS_ROW_RATIO + PIPS_SPACE_EXTRA;

  canvas.style.padding = (margin + pipsSpace) + 'px ' + margin + 'px ' + margin + 'px';
  canvas.style.gap = gap + 'px';
  // Se le carte escono dallo schermo si parte da sinistra, altrimenti si centrano
  const totalWidth = n * cardWidth + (n - 1) * gap + 2 * margin;
  canvas.style.justifyContent = totalWidth > W + 0.5 ? 'flex-start' : 'center';

  cards.forEach(card => {
    card.style.width = cardWidth + 'px';
    card.style.height = cardHeight + 'px';
    card.style.borderRadius = (cardWidth * 0.05) + 'px';
    // Larghezza della carta: token, gocce, NEW e glow si ridimensionano con lei
    card.style.setProperty('--cw', cardWidth + 'px');
  });
}

// Elementi da mostrare sopra la carta, come classi CSS:
// - potere: un token per ogni token rimasto;
// - minion: la vita attuale in gocce, quante più possibile da 5 (più grandi) e il resto da 1.
// Solo nella VistaCartaCoda: lost = punti vita tolti (gocce grigie in fondo), gained = punti vita aggiunti
// (gocce da 1 con un glow, prima delle grigie); il resto della vita si raggruppa come sempre.
function pipClasses(state, lost = 0, gained = 0) {
  const { data, tokens, hp } = state;
  if (data.type === 'Power') return Array(Math.max(0, tokens)).fill('pip');
  if (data.type === 'Minion' && hp !== null && hp !== undefined) {
    const extra = Math.max(0, Math.min(gained, hp));
    const base = Math.max(0, hp) - extra;
    return [
      ...Array(Math.floor(base / DROP_BIG_VALUE)).fill('drop5'),
      ...Array(base % DROP_BIG_VALUE).fill('drop'),
      ...Array(extra).fill('drop gained'),
      ...Array(Math.max(0, lost)).fill('drop lost')
    ];
  }
  return [];
}

// Aggiorna quello che sta sopra/sopra la carta (in coda o ingrandita): token o gocce, etichetta NEW e glow dorato
function decorate(el, state, lost = 0, gained = 0) {
  const classes = pipClasses(state, lost, gained);
  let pips = el.querySelector('.pips');
  if (classes.length === 0) {
    if (pips) pips.remove();
  } else {
    if (!pips) {
      pips = document.createElement('span');
      pips.className = 'pips';
      el.appendChild(pips);
    }
    pips.replaceChildren(...classes.map(cls => {
      const item = document.createElement('span');
      item.className = cls;
      return item;
    }));
  }

  let tag = el.querySelector('.new-tag');
  if (state.isNew && !tag) {
    tag = document.createElement('span');
    tag.className = 'new-tag';
    tag.textContent = 'NEW';
    el.appendChild(tag);
  } else if (!state.isNew && tag) {
    tag.remove();
  }
  el.classList.toggle('is-new', !!state.isNew);
}

// Animazione del token tolto: un token "fantasma" in fondo alla fila che sfuma da opaco a trasparente e poi sparisce
function fadeOutToken(card) {
  const pips = card.querySelector('.pips');
  if (!pips) return;
  const ghost = document.createElement('span');
  ghost.className = 'pip fading';
  ghost.addEventListener('animationend', () => ghost.remove());
  // Se l'animazione non parte (per esempio pagina in background), il token sparisce comunque
  setTimeout(() => ghost.remove(), 900);
  pips.appendChild(ghost);
}

// Testo del pulsante per la carta da risolvere. Sull'ultima carta della coda si pesca la nuova.
function actionText(card, isNew, isLast) {
  const { data, tokens } = card.state;
  if (isNew) return data.type === 'Attack' ? 'Risolto' : 'Ok';
  if (data.type === 'Power' && tokens > 1) return isLast ? 'Togli 1 e Pesca' : 'Togli 1 e vai avanti';
  if (data.type === 'Minion') return isLast ? 'Va avanti e Pesca' : 'Va avanti';
  return isLast ? 'Risolto e Pesca' : 'Risolto';
}

// Copia ingrandita di una carta della coda, con token/gocce e NEW
function makeBig(src) {
  const big = document.createElement('div');
  big.className = 'card';
  big.style.backgroundImage = src.style.backgroundImage;
  if (src.state) decorate(big, src.state);
  return big;
}

// Dimensiona una carta ingrandita nello spazio W x H, lasciando sopra lo spazio per token e gocce
function sizeBig(big, W, H) {
  const margin = Math.min(W, H) * 0.05;
  const width = Math.max(0, Math.min(W - 2 * margin, (H - 2 * margin - PIPS_SPACE_EXTRA) / (CARD_RATIO + PIPS_ROW_RATIO)));
  big.style.width = width + 'px';
  big.style.height = (width * CARD_RATIO) + 'px';
  big.style.borderRadius = (width * 0.05) + 'px';
  big.style.marginTop = (width * PIPS_ROW_RATIO + PIPS_SPACE_EXTRA) + 'px';
  big.style.setProperty('--cw', width + 'px');
}

// Posiziona l'overlay nello spazio sotto la coda e ingrandisce la carta al centro
function layoutOverlay() {
  if (!resolving) return;

  const queueRect = canvas.getBoundingClientRect();
  const rect = {
    left: queueRect.left,
    top: queueRect.bottom,
    width: queueRect.width,
    height: Math.max(0, controls.getBoundingClientRect().top - queueRect.bottom)
  };
  overlay.style.left = rect.left + 'px';
  overlay.style.top = rect.top + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';

  const big = overlay.firstElementChild;
  if (big) sizeBig(big, rect.width, rect.height);
}

// VistaCartaCoda: ingrandisce al centro dello schermo la carta toccata (sotto, gli eventuali pulsanti)
function layoutZoom() {
  const big = zoom.firstElementChild;
  if (!big) return;
  const below = Array.from(zoom.children).slice(1);
  const extra = below.reduce((sum, el) => sum + el.offsetHeight, 0) + below.length * ZOOM_GAP;
  sizeBig(big, zoom.clientWidth, zoom.clientHeight - extra);
}

// Carta della coda mostrata in VistaCartaCoda e "sessione" di danni: stato della partita e vita all'apertura
let zoomedCard = null;
let zoomSession = null;

function openZoom(card) {
  zoomedCard = card;
  zoomSession = { before: snapshot(), startHp: card.state.hp };
  const { data } = card.state;
  const big = makeBig(card);

  // Azioni in VistaCoda: danno o cura ai minion (vita persa in grigio, solo qui); i poteri si tolgono pagando il costo.
  // "Done" chiude la vista e conferma i danni.
  const actions = document.createElement('div');
  actions.className = 'zoom-actions';
  const addAction = (text, handler, extraClass) => {
    const button = document.createElement('button');
    button.textContent = text;
    if (extraClass) button.className = extraClass;
    button.addEventListener('click', handler);
    actions.appendChild(button);
  };
  if (data.type === 'Minion' && card.state.hp !== null) {
    addAction('−5', () => changeHp(-5));
    addAction('−1', () => changeHp(-1));
    addAction('+1', () => changeHp(1));
  } else if (data.type === 'Power') {
    addAction('Rimuovi', () => act(removeZoomedCard), 'danger');
  }
  if (actions.children.length > 0) addAction('Done', finishZoom, 'done');
  // Toccare un pulsante non chiude la VistaCartaCoda
  actions.addEventListener('click', e => e.stopPropagation());

  zoom.replaceChildren(big);
  if (actions.children.length > 0) zoom.appendChild(actions);
  zoom.hidden = false;
  layoutZoom();
}

// Chiude la vista senza conferme (usato anche da undo e nuova partita)
function closeZoom() {
  zoom.hidden = true;
  zoom.replaceChildren();
  zoomedCard = null;
  zoomSession = null;
}

// Uscita dalla VistaCartaCoda (Done o tocco fuori): se la vita del minion è cambiata, l'undo ha un solo passo
// (lo stato prima dei danni); un minion arrivato a 0 va negli scarti
function finishZoom() {
  const card = zoomedCard;
  const session = zoomSession;
  closeZoom();
  if (!card || !session || card.state.hp === session.startHp) return;
  undoStack.push(session.before);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  if (card.state.hp <= 0) {
    discardCard(card);
    layout();
    centerQueue();
  }
  updateUndoBtn();
  save();
}

// Mostra ingrandita una carta qualsiasi (per esempio dagli scarti), senza azioni
function openImageZoom(imagePath) {
  const big = document.createElement('div');
  big.className = 'card';
  big.style.backgroundImage = `url("${encodeURI(imagePath)}")`;
  zoom.replaceChildren(big);
  zoom.hidden = false;
  layoutZoom();
}

// Pila degli scarti consultabile: miniature dalla più recente alla più vecchia; un tocco ingrandisce la carta
function openDiscard() {
  discardTitle.textContent = 'Scarti (' + discard.length + ')';
  discardGrid.replaceChildren();
  if (discard.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'discard-empty';
    empty.textContent = 'Nessuna carta scartata';
    discardGrid.appendChild(empty);
  }
  for (let i = discard.length - 1; i >= 0; i--) {
    const item = document.createElement('div');
    item.className = 'discard-item';
    item.style.backgroundImage = `url("${encodeURI(discard[i].image)}")`;
    // La più recente è la prima in alto: si segnano l'ultima scartata e la prima scartata
    const label = discard.length === 1 ? 'Unica' : i === discard.length - 1 ? 'Ultima' : i === 0 ? 'Prima' : null;
    if (label) {
      const tag = document.createElement('span');
      tag.className = 'discard-tag';
      tag.textContent = label;
      item.appendChild(tag);
    }
    item.addEventListener('click', () => openImageZoom(discard[i].image));
    discardGrid.appendChild(item);
  }
  discardLayer.hidden = false;
}

function closeDiscard() {
  discardLayer.hidden = true;
  discardGrid.replaceChildren();
}

// Cambia la vita del minion mostrato, tra 0 e la sua vita massima; la vita tolta si vede in grigio solo qui.
// A 0 la vista resta aperta: il minion esce dalla coda all'uscita (Done).
function changeHp(delta) {
  const card = zoomedCard;
  card.state.hp = Math.min(card.state.data.hp, Math.max(0, card.state.hp + delta));
  decorate(card, card.state);
  const change = card.state.hp - zoomSession.startHp;
  decorate(zoom.firstElementChild, card.state, Math.max(0, -change), Math.max(0, change));
}

// Toglie dalla coda la carta mostrata e torna alla VistaCoda
function removeZoomedCard() {
  const card = zoomedCard;
  closeZoom();
  discardCard(card);
  layout();
  centerQueue();
}

function createCard(data) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = data.id;
  // Stato della carta in gioco: token rimasti, vita attuale, appena pescata
  card.state = { data, tokens: data.tokens, hp: data.hp, isNew: false };
  card.style.backgroundImage = `url("${encodeURI(data.image)}")`;
  decorate(card, card.state);
  return card;
}

function addCard(data) {
  const card = createCard(data);
  canvas.appendChild(card);
  layout();
  centerQueue();
  return card;
}

// Se la coda esce dallo schermo, mostra il suo centro (carte tagliate in modo uguale ai lati)
function centerQueue() {
  const left = Math.max(0, (canvas.scrollWidth - canvas.clientWidth) / 2);
  canvas.scrollLeft = left;
}

// Nuova partita con le scelte correnti: coda vuota, nessuna carta
function reset() {
  closeZoom();
  queueCards().forEach(card => card.remove());
  canvas.scrollLeft = 0;
  newIndex = -1;
  setResolvingUI(false);
  newGame();
  layout();
}

// Pagina iniziale: si scelgono giocatori, nemesi e battaglia
function renderChoices(container, values, selected, onPick) {
  container.replaceChildren();
  values.forEach(value => {
    const button = document.createElement('button');
    button.textContent = value;
    button.classList.toggle('selected', String(value) === String(selected));
    button.addEventListener('click', () => {
      onPick(value);
      container.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === button));
    });
    container.appendChild(button);
  });
}

// Boss della wave scelta: nome, battaglia e (in alto a destra) la mini espansione
function renderBosses(wave) {
  const container = document.getElementById('choices-nemesis');
  container.replaceChildren();
  nemeses.filter(n => n.wave === wave).forEach(info => {
    const button = document.createElement('button');
    button.className = 'boss';
    button.textContent = info.name;
    const battle = document.createElement('span');
    battle.className = 'boss-battle';
    battle.textContent = info.battle ? 'Battaglia ' + info.battle : 'Battaglia non indicata';
    button.appendChild(battle);
    if (info.miniExpansion) {
      const tag = document.createElement('span');
      tag.className = 'mini-exp';
      tag.textContent = info.miniExpansion;
      button.appendChild(tag);
    }
    button.disabled = !isPlayable(info);
    button.classList.toggle('selected', info.name === settings.nemesis);
    button.addEventListener('click', () => {
      settings.nemesis = info.name;
      container.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === button));
    });
    container.appendChild(button);
  });
}

function renderStartChoices() {
  renderChoices(document.getElementById('choices-players'), startOptions.players, settings.players, v => { settings.players = Number(v); });

  const waveSelect = document.getElementById('wave-select');
  const current = nemeses.find(n => n.name === settings.nemesis);
  waveSelect.replaceChildren(...startOptions.waves.map(wave => {
    const option = document.createElement('option');
    option.value = wave;
    option.textContent = wave;
    return option;
  }));
  waveSelect.value = current ? current.wave : startOptions.waves[0];
  renderBosses(waveSelect.value);

  document.getElementById('upgraded-switch').checked = settings.includeUpgraded !== false;
}

function buildStartPage() {
  const waves = [...new Set([...nemeses].sort((a, b) => a.waveOrder - b.waveOrder).map(n => n.wave))];
  startOptions = { players: Object.keys(deckSetup.battles[0].players).map(Number), waves };
  const firstPlayable = nemeses.find(isPlayable);
  settings = { players: startOptions.players[0], nemesis: firstPlayable ? firstPlayable.name : null, includeUpgraded: true };
  renderStartChoices();
  document.getElementById('wave-select').addEventListener('change', e => renderBosses(e.target.value));
  document.getElementById('upgraded-switch').addEventListener('change', e => { settings.includeUpgraded = e.target.checked; });
}

function openStart() {
  resumeBtn.hidden = !readSave();
  startLayer.hidden = false;
}

// Inizia: nuova partita con le scelte fatte (la partita salvata viene sostituita)
function startGame() {
  if (!battleOf(settings.nemesis)) {
    startError.textContent = 'Scegli un boss';
    return;
  }
  startError.textContent = '';
  startLayer.hidden = true;
  undoStack = [];
  reset();
  updateUndoBtn();
  save();
}

// Riprendi partita: si ricarica lo stato salvato nel browser, compreso l'undo
function resumeGame() {
  const saved = readSave();
  if (!saved) return;
  try {
    settings = saved.settings;
    restore(saved.state);
    undoStack = Array.isArray(saved.undo) ? saved.undo : [];
    renderStartChoices();
    startLayer.hidden = true;
    updateUndoBtn();
  } catch (err) {
    console.error(err);
    localStorage.removeItem(SAVE_KEY);
    resumeBtn.hidden = true;
    startError.textContent = 'La partita salvata non si può riprendere';
  }
}

// --- Stato della partita: salvataggio, undo, ripristino -------------------------------------------------------

// Fotografia della partita (solo dati semplici, così si può salvare nel browser)
function snapshot() {
  return {
    turn,
    deck: deck.map(c => c.id),
    discard: discard.map(c => c.id),
    queue: queueCards().map(c => ({ id: c.state.data.id, tokens: c.state.tokens, hp: c.state.hp, isNew: !!c.state.isNew })),
    resolving,
    currentIndex,
    newIndex
  };
}

// Rimette la partita come nella fotografia (senza animazioni)
function restore(s) {
  const get = id => {
    const card = cardsById.get(id);
    if (!card) throw new Error('Carta sconosciuta: ' + id);
    return card;
  };
  // Prima si leggono tutti i dati: se qualcosa non va, la partita in corso resta com'è
  const newDeck = s.deck.map(get);
  const newDiscard = s.discard.map(get);
  const newQueue = s.queue.map(q => ({ ...q, data: get(q.id) }));

  closeZoom();
  closeDiscard();
  flipPending = false;
  queueCards().forEach(card => card.remove());
  deck = newDeck;
  discard = newDiscard;
  turn = s.turn;
  newQueue.forEach(q => {
    const card = createCard(q.data);
    Object.assign(card.state, { tokens: q.tokens, hp: q.hp, isNew: q.isNew });
    decorate(card, card.state);
    canvas.appendChild(card);
  });
  updateInfo();

  if (s.resolving && newQueue.length > 0) {
    setResolvingUI(true);
    currentIndex = Math.min(s.currentIndex, newQueue.length - 1);
    newIndex = s.newIndex;
    layout();
    showCurrent();
  } else {
    newIndex = -1;
    setResolvingUI(false);
    layout();
    centerQueue();
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ settings, state: snapshot(), undo: undoStack }));
  } catch (err) {
    console.warn('Salvataggio non riuscito', err);
  }
}

function readSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved && saved.state && saved.settings) return saved;
  } catch (err) {
    console.warn('Salvataggio illeggibile', err);
  }
  return null;
}

function updateUndoBtn() {
  undoBtn.disabled = undoStack.length === 0;
}

// Ogni azione che cambia la partita: prima si salva lo stato per l'undo, poi si fa l'azione, poi si salva la partita
function act(action) {
  undoStack.push(snapshot());
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  action();
  updateUndoBtn();
  save();
}

// Undo: torna allo stato prima dell'ultima azione (si può ripetere fino all'inizio della partita)
function undo() {
  const previous = undoStack.pop();
  if (!previous) return;
  restore(previous);
  updateUndoBtn();
  save();
}

// --- VistaRisoluzione -------------------------------------------------------------------------------------------

// Mostra o nasconde la parte di interfaccia della VistaRisoluzione
function setResolvingUI(on) {
  resolving = on;
  canvas.classList.toggle('resolving', on);
  overlay.hidden = !on;
  if (!on) overlay.replaceChildren();
  nemesisBtn.hidden = on;
  resolveBtn.hidden = !on;
  infoRow.hidden = on;
  phaseLabel.classList.toggle('invisible', on);
  if (!on) queueCards().forEach(card => card.classList.remove('viewed', 'to-resolve'));
}

// Porta in vista nella coda la carta da risolvere
function markCurrent() {
  const card = queueCards()[currentIndex];
  if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

// Mostra ingrandita la carta viewIndex; nella fascia: glow bianco sulla carta guardata, rosso su quella da risolvere
function showBig() {
  const cards = queueCards();
  const isNewStep = newIndex >= 0;
  cards.forEach((card, i) => {
    card.classList.toggle('viewed', i === viewIndex);
    card.classList.toggle('to-resolve', !isNewStep && i === currentIndex);
  });

  // Il pulsante vale solo per la carta da risolvere, non per una che si sta solo guardando.
  // Dopo la pesca (Ok / Risolto sulla carta nuova) è sempre attivo, qualunque carta si stia guardando.
  resolveBtn.textContent = actionText(cards[currentIndex], isNewStep, currentIndex === cards.length - 1);
  resolveBtn.disabled = !isNewStep && viewIndex !== currentIndex;

  const big = makeBig(cards[viewIndex]);
  if (flipPending && viewIndex === newIndex) {
    big.classList.add('flip-in');
    flipPending = false;
  }
  overlay.replaceChildren(big);
  layoutOverlay();
}

// Passa alla carta da risolvere e la mostra ingrandita
function showCurrent() {
  viewIndex = currentIndex;
  markCurrent();
  showBig();
}

function startResolution() {
  // Un nuovo turno: la carta pescata nel turno precedente non è più "NEW"
  queueCards().forEach(card => {
    if (card.state.isNew) {
      card.state.isNew = false;
      decorate(card, card.state);
    }
  });
  currentIndex = 0;
  newIndex = -1;
  setResolvingUI(true);
  // La coda si restringe in alto: ricalcola la dimensione delle carte
  layout();

  // Coda vuota: non c'è niente da risolvere, si pesca direttamente la carta nuova
  if (queueCards().length === 0) {
    drawNewCard();
  } else {
    showCurrent();
  }
}

// Pesca una carta in fondo alla coda e la mostra come nuova (NEW, glow dorato, entra girandosi)
function drawNewCard() {
  const data = drawFromDeck();
  // Niente da pescare (mazzo e scarti vuoti): si torna alla VistaCoda
  if (!data) {
    endResolution();
    return;
  }
  const total = queueCards().length;
  const card = addCard(data);
  card.state.isNew = true;
  decorate(card, card.state);
  newIndex = total;
  currentIndex = total;
  flipPending = true;
  showCurrent();
}

// Ritorno alla VistaCoda
function endResolution() {
  newIndex = -1;
  setResolvingUI(false);
  layout();
  centerQueue();
}

function nemesisTurn() {
  turn++;
  updateInfo();
  startResolution();
}

// Pulsante principale della VistaRisoluzione: agisce sulla carta da risolvere in base al suo tipo
function resolveCurrent() {
  const card = queueCards()[currentIndex];
  const { data, tokens } = card.state;

  // Carta appena pescata: un attacco si risolve subito ed esce dalla coda, le altre restano.
  // Poi ritorno alla VistaCoda.
  // Con "Ok" la carta smette di essere nuova: spariscono NEW e glow dorato.
  if (newIndex >= 0) {
    if (data.type === 'Attack') {
      discardCard(card);
    } else {
      card.state.isNew = false;
      decorate(card, card.state);
    }
    endResolution();
    return;
  }

  if (data.type === 'Power' && tokens > 1) {
    // Potere: si toglie un token (che sparisce sfumando nella fascia) e si va avanti
    card.state.tokens--;
    decorate(card, card.state);
    fadeOutToken(card);
    currentIndex++;
  } else if (data.type === 'Minion') {
    // Minion: resta in coda, si va avanti
    currentIndex++;
  } else {
    // Potere all'ultimo token o attacco: risolto, va negli scarti (la carta dopo prende il suo posto)
    discardCard(card);
  }
  // Con una carta in meno le altre possono ingrandirsi
  layout();

  // Finita la coda: si pesca la nuova carta e la si mostra
  if (currentIndex >= queueCards().length) {
    drawNewCard();
  } else {
    showCurrent();
  }
}

// Sposta solo la carta mostrata, restando dentro la coda; la carta da risolvere non cambia
function moveView(step) {
  const next = viewIndex + step;
  if (next < 0 || next >= queueCards().length) return;
  viewIndex = next;
  showBig();
  // Tiene in vista nella coda la carta guardata
  queueCards()[viewIndex].scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
}

// Slide in VistaRisoluzione: verso sinistra = carta successiva, verso destra = precedente
let swipeStartX = null;
let swipeStartY = null;

overlay.addEventListener('pointerdown', e => {
  swipeStartX = e.clientX;
  swipeStartY = e.clientY;
});

overlay.addEventListener('pointerup', e => {
  if (swipeStartX === null) return;
  const dx = e.clientX - swipeStartX;
  const dy = e.clientY - swipeStartY;
  swipeStartX = null;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy)) return;
  moveView(dx < 0 ? 1 : -1);
});

overlay.addEventListener('pointercancel', () => {
  swipeStartX = null;
});

// Tocco su una carta della coda (solo in VistaCoda) = VistaCartaCoda; un tocco ovunque la chiude
// In VistaRisoluzione invece il tocco su una carta della fascia la mostra ingrandita (come lo slide, senza risolvere nulla)
canvas.addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (!card) return;
  if (resolving) {
    viewIndex = queueCards().indexOf(card);
    showBig();
    return;
  }
  openZoom(card);
});
zoom.addEventListener('click', finishZoom);

discardBtn.addEventListener('click', openDiscard);
discardClose.addEventListener('click', closeDiscard);
menuBtn.addEventListener('click', openStart);
startBtn.addEventListener('click', startGame);
resumeBtn.addEventListener('click', resumeGame);
undoBtn.addEventListener('click', undo);

nemesisBtn.addEventListener('click', () => act(nemesisTurn));
resolveBtn.addEventListener('click', () => act(resolveCurrent));
window.addEventListener('resize', () => {
  layout();
  layoutOverlay();
  layoutZoom();
});

// Avvio: legge cards.json e deck-setup.json, mostra la pagina iniziale (con "Riprendi partita" se ce n'è una salvata)
async function init() {
  nemesisBtn.disabled = true;
  startBtn.disabled = true;
  try {
    [allCards, deckSetup, nemeses] = await Promise.all([loadJson('cards.json'), loadJson('deck-setup.json'), loadJson('nemesis.json')]);
    if (allCards.length === 0) throw new Error('Nessuna carta trovata in cards.json');
    cardsById = new Map(allCards.map(c => [c.id, c]));
    buildStartPage();
    newGame();
    nemesisBtn.disabled = false;
    startBtn.disabled = false;
    resumeBtn.hidden = !readSave();
    updateUndoBtn();
  } catch (err) {
    console.error(err);
    startError.textContent = 'Errore: carte non trovate';
  }
}

init();
