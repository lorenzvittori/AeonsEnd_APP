const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const zoom = document.getElementById('zoom');
const nemesisBtn = document.getElementById('nemesis-btn');
const resetBtn = document.getElementById('reset-btn');
const resolveBtn = document.getElementById('resolve-btn');
const controls = document.querySelector('.controls');
const resolveMarker = document.getElementById('resolve-marker');
const statusEl = document.getElementById('status');
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
const startError = document.getElementById('start-error');

// Rapporto carta standard: 63 x 88 mm
const CARD_RATIO = 88 / 63;

// Oltre questo numero di carte la dimensione resta fissa e si scorre di lato
const MAX_VISIBLE = 5;

// Spazio (px) lasciato ai lati della carta ingrandita per la scritta NUOVA
const LABEL_SPACE = 30;

// Distanza minima (px) di uno slide per cambiare carta in VistaRisoluzione
const SWIPE_MIN_DISTANCE = 50;

// Spazio sopra ogni carta della coda per token (potere) e gocce di vita (minion): una fila alta PIPS_ROW_RATIO x larghezza
// carta, PIPS_PER_ROW elementi per fila, più PIPS_SPACE_EXTRA px (devono corrispondere a .pips / .pip / .drop in style.css)
const PIPS_ROW_RATIO = 0.26;
const PIPS_PER_ROW = 5;
const PIPS_SPACE_EXTRA = 6;

// Spazio (px) tra gli elementi della VistaCartaCoda (carta, scritta, pulsanti): lo stesso di #zoom in style.css
const ZOOM_GAP = 12;

// Tutte le carte (cards.json, generato da cards.csv con tools/build-cards.ps1) e la tabella
// Nemesis Deck Setup (deck-setup.json), lette all'avvio
let allCards = [];
let deckSetup = null;

// Scelte della pagina iniziale: giocatori, nemesi e battaglia
let settings = { players: 2, nemesis: null, battle: 1 };

// Stato della VistaRisoluzione (false = VistaCoda)
let resolving = false;
// Carta da risolvere (bordo bianco): cambia solo con "Risolta"
let currentIndex = 0;
// Carta mostrata ingrandita: cambia anche con lo slide, senza risolvere nulla
let viewIndex = 0;
// Indice della carta appena pescata alla fine della risoluzione (-1 = nessuna)
let newIndex = -1;

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Impossibile leggere ' + path + ' (' + res.status + ')');
  return res.json();
}

// Mazzo nemesi (si pesca dalla fine), pila degli scarti e numero di turni nemesi giocati
let deck = [];
let discard = [];
let turn = 0;

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

// Mazzo per la battaglia scelta (Nemesis Deck Setup): per ogni Tier si estraggono a caso le carte base e
// potenziate indicate nella tabella e si aggiungono le carte specifiche del nemico di quel Tier.
// Ogni Tier è mescolato a parte; si pesca dalla fine, quindi in cima c'è il Tier 1 e in fondo il Tier 3.
// Restano fuori le carte senza Tier (World Devourer, Rending Claw) e la maledizione dei giocatori.
function buildDeck() {
  const battle = deckSetup.battles.find(b => b.battle === settings.battle);
  const setup = battle.players[String(settings.players)];
  const result = [];
  [3, 2, 1].forEach(tier => {
    const ofTier = c => c.tier === tier && c.type !== 'Curse';
    const group = [
      ...pickRandom(allCards.filter(c => c.category === 'Basic Nemesis' && ofTier(c)), setup.basic[tier]),
      ...pickRandom(allCards.filter(c => c.category === 'Upgraded Basic Nemesis' && ofTier(c)), setup.upgradedBasic[tier]),
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

// Toglie la carta dalla coda e la mette nella pila degli scarti
function discardCard(card) {
  discard.push(card.state.data);
  card.remove();
  updateInfo();
}

function updateInfo() {
  turnInfo.textContent = 'Turno ' + turn + ' · Mazzo ' + deck.length;
  discardBtn.textContent = 'Scarti (' + discard.length + ')';
}

function layout() {
  const cards = canvas.querySelectorAll('.card');
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

  // Larghezza massima se limitati dallo spazio verticale: sopra la carta si lascia lo spazio per i pallini dei token
  // (altezza carta + PIPS_SPACE_RATIO * larghezza + PIPS_SPACE_EXTRA deve stare in availH)
  // Le file di token/gocce necessarie sono quelle della carta che ne ha di più
  const rows = Math.max(1, ...Array.from(cards, card => Math.ceil(pipCount(card) / PIPS_PER_ROW)));
  const availH = H - 2 * margin;
  const widthFromHeight = Math.max(0, availH - PIPS_SPACE_EXTRA) / (CARD_RATIO + rows * PIPS_ROW_RATIO);

  const cardWidth = Math.max(0, Math.min(widthFromWidth, widthFromHeight));
  const cardHeight = cardWidth * CARD_RATIO;
  const pipsSpace = rows * cardWidth * PIPS_ROW_RATIO + PIPS_SPACE_EXTRA;

  canvas.style.padding = (margin + pipsSpace) + 'px ' + margin + 'px ' + margin + 'px';
  canvas.style.gap = gap + 'px';
  // Se le carte escono dallo schermo si parte da sinistra, altrimenti si centrano
  const totalWidth = n * cardWidth + (n - 1) * gap + 2 * margin;
  canvas.style.justifyContent = totalWidth > W + 0.5 ? 'flex-start' : 'center';

  cards.forEach(card => {
    card.style.width = cardWidth + 'px';
    card.style.height = cardHeight + 'px';
    card.style.borderRadius = (cardWidth * 0.05) + 'px';
    // Larghezza della carta: il badge di token/vita si ridimensiona con lei
    card.style.setProperty('--cw', cardWidth + 'px');
  });

  updateResolveMarker();
}

// Badge sulla carta in coda: token rimasti (potere) o vita (minion)
// Quanti elementi (token o gocce) ha la carta sopra di sé
function pipCount(card) {
  const { data, tokens, hp, maxHp } = card.state;
  if (data.type === 'Power') return Math.max(0, tokens);
  if (data.type === 'Minion' && hp !== null && hp !== undefined) return Math.max(maxHp, hp);
  return 0;
}

// Sopra la carta: potere = un token per ogni token rimasto; minion = una goccia per ogni punto di vita
// (rossa se è ancora vita, grigia se è stata persa col danno)
function updateBadge(card) {
  const { data, hp } = card.state;
  const classes = [];
  const count = pipCount(card);
  for (let i = 0; i < count; i++) {
    if (data.type === 'Power') classes.push('pip');
    else classes.push(i < hp ? 'drop' : 'drop lost');
  }

  let pips = card.querySelector('.pips');
  if (classes.length === 0) {
    if (pips) pips.remove();
    return;
  }
  if (!pips) {
    pips = document.createElement('span');
    pips.className = 'pips';
    card.appendChild(pips);
  }
  pips.replaceChildren(...classes.map(cls => {
    const item = document.createElement('span');
    item.className = cls;
    return item;
  }));
}

// Informazione sulla carta: token rimasti o vita
function cardInfo(card) {
  const { data, tokens, hp } = card.state;
  if (data.type === 'Power') return 'Token: ' + tokens;
  if (data.type === 'Minion' && hp !== null) return 'Vita: ' + hp;
  return '';
}

// La carta va risolta adesso? Minion e attacchi sempre, poteri solo all'ultimo token.
// La carta appena pescata: solo gli attacchi (minion e poteri entrano in gioco e basta).
function needsResolve(card, isNew) {
  const { data, tokens } = card.state;
  if (data.type === 'Attack') return true;
  if (isNew) return false;
  if (data.type === 'Minion') return true;
  return data.type === 'Power' && tokens <= 1;
}

// Testo del pulsante per la carta da risolvere. Sull'ultima carta della coda si pesca la nuova.
function actionText(card, isNew, isLast) {
  const { data, tokens } = card.state;
  if (isNew) return data.type === 'Attack' ? 'Risolto' : 'Ok';
  if (data.type === 'Power' && tokens > 1) return isLast ? 'Togli 1 e Pesca' : 'Togli 1 e vai avanti';
  if (data.type === 'Minion') return isLast ? 'Va avanti e Pesca' : 'Va avanti';
  return isLast ? 'Risolto e Pesca' : 'Risolto';
}

// Lineetta sotto la carta da risolvere, nella fascia della coda (solo in VistaRisoluzione)
function updateResolveMarker() {
  const card = canvas.querySelectorAll('.card')[currentIndex];
  if (!resolving || !card) {
    resolveMarker.hidden = true;
    return;
  }
  resolveMarker.hidden = false;
  resolveMarker.style.left = (card.offsetLeft + card.offsetWidth * 0.2) + 'px';
  resolveMarker.style.width = (card.offsetWidth * 0.6) + 'px';
  resolveMarker.style.top = (card.offsetTop + card.offsetHeight + 4) + 'px';
}

// Posiziona l'overlay nello spazio sotto la coda e ingrandisce la carta al centro
function layoutOverlay() {
  if (!resolving) return;

  const queueRect = canvas.getBoundingClientRect();
  const rect = {
    left: queueRect.left,
    top: queueRect.bottom,
    width: queueRect.width,
    height: controls.getBoundingClientRect().top - queueRect.bottom
  };
  overlay.style.left = rect.left + 'px';
  overlay.style.top = rect.top + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = Math.max(0, rect.height) + 'px';

  const big = overlay.firstElementChild;
  if (!big) return;

  // Lo spazio a destra e a sinistra è riservato alla scritta NUOVA
  const margin = Math.min(rect.width, rect.height) * 0.05;
  const side = margin + LABEL_SPACE;
  const width = Math.max(0, Math.min(rect.width - 2 * side, (rect.height - 2 * margin) / CARD_RATIO));
  big.style.width = width + 'px';
  big.style.height = (width * CARD_RATIO) + 'px';
  big.style.borderRadius = (width * 0.05) + 'px';
}

// VistaCoda: ingrandisce al centro dello schermo la carta toccata
function layoutZoom() {
  const big = zoom.firstElementChild;
  if (!big) return;

  // Sotto la carta ci sono la scritta con token/vita e i pulsanti: si toglie il loro spazio
  const below = Array.from(zoom.children).slice(1);
  const extra = below.reduce((sum, el) => sum + el.offsetHeight, 0) + below.length * ZOOM_GAP;
  const W = zoom.clientWidth;
  const H = zoom.clientHeight - extra;
  const margin = Math.min(W, H) * 0.05;
  const width = Math.max(0, Math.min(W - 2 * margin, (H - 2 * margin) / CARD_RATIO));
  big.style.width = width + 'px';
  big.style.height = (width * CARD_RATIO) + 'px';
  big.style.borderRadius = (width * 0.05) + 'px';
}

// Carta della coda mostrata in VistaCartaCoda
let zoomedCard = null;

function openZoom(card) {
  zoomedCard = card;
  const { data } = card.state;

  const big = document.createElement('div');
  big.className = 'card';
  big.style.backgroundImage = card.style.backgroundImage;

  const info = document.createElement('div');
  info.className = 'zoom-info';
  info.textContent = cardInfo(card);

  // Azioni in VistaCoda: danno o cura ai minion e uscita dalla coda; i poteri si tolgono quando si paga il costo
  const actions = document.createElement('div');
  actions.className = 'zoom-actions';
  const addAction = (text, handler, extraClass) => {
    const button = document.createElement('button');
    button.textContent = text;
    if (extraClass) button.className = extraClass;
    button.addEventListener('click', handler);
    actions.appendChild(button);
  };
  if (data.type === 'Minion') {
    if (card.state.hp !== null) {
      addAction('−5', () => changeHp(-5));
      addAction('−1', () => changeHp(-1));
      addAction('+1', () => changeHp(1));
    }
    addAction('Uccidi', removeZoomedCard, 'danger');
  } else if (data.type === 'Power') {
    addAction('Rimuovi', removeZoomedCard, 'danger');
  }
  // Toccare un pulsante non chiude la VistaCartaCoda
  actions.addEventListener('click', e => e.stopPropagation());

  zoom.replaceChildren(big, info);
  if (actions.children.length > 0) zoom.appendChild(actions);
  zoom.hidden = false;
  layoutZoom();
}

function closeZoom() {
  zoom.hidden = true;
  zoom.replaceChildren();
  zoomedCard = null;
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
    item.addEventListener('click', () => openImageZoom(discard[i].image));
    discardGrid.appendChild(item);
  }
  discardLayer.hidden = false;
}

function closeDiscard() {
  discardLayer.hidden = true;
  discardGrid.replaceChildren();
}

// Cambia la vita del minion mostrato; a 0 o meno esce dalla coda
function changeHp(delta) {
  const card = zoomedCard;
  card.state.hp = Math.max(0, card.state.hp + delta);
  if (card.state.hp <= 0) {
    removeZoomedCard();
    return;
  }
  // Se si cura oltre la vita iniziale compaiono altre gocce rosse
  card.state.maxHp = Math.max(card.state.maxHp, card.state.hp);
  updateBadge(card);
  layout();
  zoom.querySelector('.zoom-info').textContent = cardInfo(card);
}

// Toglie dalla coda la carta mostrata e torna alla VistaCoda
function removeZoomedCard() {
  const card = zoomedCard;
  closeZoom();
  discardCard(card);
  layout();
  centerQueue();
}

function addCard(data) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = data.id;
  // Stato della carta in gioco: token rimasti e vita attuale
  card.state = { data, tokens: data.tokens, hp: data.hp, maxHp: data.hp };
  card.style.backgroundImage = `url("${encodeURI(data.image)}")`;
  canvas.appendChild(card);
  updateBadge(card);
  layout();
  centerQueue();
}

// Se la coda esce dallo schermo, mostra il suo centro (carte tagliate in modo uguale ai lati)
function centerQueue() {
  const left = Math.max(0, (canvas.scrollWidth - canvas.clientWidth) / 2);
  canvas.scrollLeft = left;
}

// Reset: nuova partita con le stesse scelte, coda vuota, nessuna carta
function reset() {
  canvas.querySelectorAll('.card').forEach(card => card.remove());
  canvas.scrollLeft = 0;
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

function buildStartPage() {
  const players = Object.keys(deckSetup.battles[0].players).map(Number);
  const nemeses = [...new Set(allCards.filter(c => c.nemesis).map(c => c.nemesis))];
  const battles = deckSetup.battles.map(b => b.battle);
  settings = { players: players[0], nemesis: nemeses[0], battle: battles[0] };
  renderChoices(document.getElementById('choices-players'), players, settings.players, v => { settings.players = Number(v); });
  renderChoices(document.getElementById('choices-nemesis'), nemeses, settings.nemesis, v => { settings.nemesis = v; });
  renderChoices(document.getElementById('choices-battle'), battles, settings.battle, v => { settings.battle = Number(v); });
}

// Inizia: nuova partita con le scelte fatte
function startGame() {
  startLayer.hidden = true;
  reset();
}

// VistaRisoluzione: porta in vista nella coda la carta da risolvere e le mette sotto la lineetta
function markCurrent() {
  const cards = canvas.querySelectorAll('.card');
  cards[currentIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  updateResolveMarker();
}

// VistaRisoluzione: mostra ingrandita la carta viewIndex
function showBig() {
  const cards = canvas.querySelectorAll('.card');
  // Nella coda la carta guardata ha il bordo bianco
  cards.forEach((card, i) => card.classList.toggle('viewed', i === viewIndex));

  // Pulsante e scritta di stato: il pulsante agisce sulla carta da risolvere, la scritta descrive quella guardata
  const isNew = newIndex >= 0;
  const current = cards[currentIndex];
  resolveBtn.textContent = actionText(current, isNew, currentIndex === cards.length - 1);
  // Il pulsante vale solo per la carta da risolvere, non per una che si sta solo guardando.
  // Dopo la pesca (Ok / Risolto sulla carta nuova) è sempre attivo, qualunque carta si stia guardando.
  resolveBtn.disabled = !isNew && viewIndex !== currentIndex;

  const parts = [];
  if (viewIndex === currentIndex && needsResolve(current, isNew)) parts.push('DA RISOLVERE');
  const info = cardInfo(cards[viewIndex]);
  if (info) parts.push(info);
  statusEl.textContent = parts.join(' · ') || ' ';
  statusEl.classList.toggle('todo', parts[0] === 'DA RISOLVERE');
  statusEl.hidden = false;

  const big = document.createElement('div');
  big.className = 'card';
  big.style.backgroundImage = cards[viewIndex].style.backgroundImage;

  // La carta appena pescata a fine risoluzione è segnata come NUOVA
  if (viewIndex === newIndex) {
    const label = document.createElement('span');
    label.className = 'new-label';
    label.textContent = 'NUOVA';
    big.appendChild(label);
  }

  overlay.replaceChildren(big);
  layoutOverlay();
  updateResolveMarker();
}

// Passa alla carta da risolvere e la mostra ingrandita
function showCurrent() {
  viewIndex = currentIndex;
  markCurrent();
  showBig();
}

function startResolution() {
  resolving = true;
  currentIndex = 0;
  newIndex = -1;
  canvas.classList.add('resolving');
  overlay.hidden = false;
  nemesisBtn.hidden = true;
  resetBtn.hidden = true;
  resolveBtn.hidden = false;
  infoRow.hidden = true;
  // La coda si restringe in alto: ricalcola la dimensione delle carte
  layout();

  // Coda vuota: non c'è niente da risolvere, si pesca direttamente la carta nuova
  if (canvas.querySelectorAll('.card').length === 0) {
    drawNewCard();
  } else {
    showCurrent();
  }
}

// Pesca una carta casuale in fondo alla coda e la mostra come nuova (con il pulsante Ok)
function drawNewCard() {
  const data = drawFromDeck();
  // Niente da pescare (mazzo e scarti vuoti): si torna alla VistaCoda
  if (!data) {
    endResolution();
    return;
  }
  const total = canvas.querySelectorAll('.card').length;
  addCard(data);
  newIndex = total;
  currentIndex = total;
  showCurrent();
}

// Ritorno alla VistaCoda
function endResolution() {
  resolving = false;
  newIndex = -1;
  canvas.classList.remove('resolving');
  canvas.querySelectorAll('.card.viewed').forEach(card => card.classList.remove('viewed'));
  overlay.replaceChildren();
  overlay.hidden = true;
  nemesisBtn.hidden = false;
  resetBtn.hidden = false;
  resolveBtn.hidden = true;
  statusEl.hidden = true;
  infoRow.hidden = false;
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
  const card = canvas.querySelectorAll('.card')[currentIndex];
  const { data, tokens } = card.state;

  // Carta appena pescata: un attacco si risolve subito ed esce dalla coda, le altre restano.
  // Poi ritorno alla VistaCoda.
  if (newIndex >= 0) {
    if (data.type === 'Attack') discardCard(card);
    endResolution();
    return;
  }

  if (data.type === 'Power' && tokens > 1) {
    // Potere: si toglie un token e si va avanti
    card.state.tokens--;
    updateBadge(card);
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
  if (currentIndex >= canvas.querySelectorAll('.card').length) {
    drawNewCard();
  } else {
    showCurrent();
  }
}

// Sposta solo la carta mostrata, restando dentro la coda; la carta da risolvere non cambia
function moveView(step) {
  const next = viewIndex + step;
  if (next < 0 || next >= canvas.querySelectorAll('.card').length) return;
  viewIndex = next;
  showBig();
  // Tiene in vista nella coda la carta guardata
  canvas.querySelectorAll('.card')[viewIndex].scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
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
canvas.addEventListener('click', e => {
  if (resolving) return;
  const card = e.target.closest('.card');
  if (card) openZoom(card);
});
zoom.addEventListener('click', closeZoom);

discardBtn.addEventListener('click', openDiscard);
discardClose.addEventListener('click', closeDiscard);
menuBtn.addEventListener('click', () => { startLayer.hidden = false; });
startBtn.addEventListener('click', startGame);

nemesisBtn.addEventListener('click', nemesisTurn);
resetBtn.addEventListener('click', reset);
resolveBtn.addEventListener('click', resolveCurrent);
window.addEventListener('resize', () => {
  layout();
  layoutOverlay();
  layoutZoom();
});

// Avvio: legge cards.json e deck-setup.json, mostra la pagina iniziale; la coda parte vuota
async function init() {
  nemesisBtn.disabled = true;
  resetBtn.disabled = true;
  startBtn.disabled = true;
  try {
    [allCards, deckSetup] = await Promise.all([loadJson('cards.json'), loadJson('deck-setup.json')]);
    if (allCards.length === 0) throw new Error('Nessuna carta trovata in cards.json');
    buildStartPage();
    newGame();
    nemesisBtn.disabled = false;
    resetBtn.disabled = false;
    startBtn.disabled = false;
  } catch (err) {
    console.error(err);
    startError.textContent = 'Errore: carte non trovate';
  }
}

init();
