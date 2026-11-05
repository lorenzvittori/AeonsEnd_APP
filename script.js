const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const zoom = document.getElementById('zoom');
const nemesisBtn = document.getElementById('nemesis-btn');
const resetBtn = document.getElementById('reset-btn');
const resolveBtn = document.getElementById('resolve-btn');
const controls = document.querySelector('.controls');
const resolveMarker = document.getElementById('resolve-marker');

// Rapporto carta standard: 63 x 88 mm
const CARD_RATIO = 88 / 63;

// Oltre questo numero di carte la dimensione resta fissa e si scorre di lato
const MAX_VISIBLE = 5;

// Spazio (px) lasciato ai lati della carta ingrandita per la scritta NUOVA
const LABEL_SPACE = 30;

// Distanza minima (px) di uno slide per cambiare carta in VistaRisoluzione
const SWIPE_MIN_DISTANCE = 50;

// Carte da cui si pesca, lette all'avvio da cards.json (generato da cards.csv con tools/build-cards.ps1)
let cardPool = [];

// Stato della VistaRisoluzione (false = VistaCoda)
let resolving = false;
// Carta da risolvere (bordo bianco): cambia solo con "Risolta"
let currentIndex = 0;
// Carta mostrata ingrandita: cambia anche con lo slide, senza risolvere nulla
let viewIndex = 0;
// Indice della carta appena pescata alla fine della risoluzione (-1 = nessuna)
let newIndex = -1;

// Per ora si pesca a caso solo tra le carte del mazzo base (Basic Nemesis); le altre arriveranno con la scelta della battaglia
async function loadCardPool() {
  const res = await fetch('cards.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Impossibile leggere cards.json (' + res.status + ')');
  const cards = await res.json();
  return cards.filter(c => c.category === 'Basic Nemesis' && c.type !== 'Curse');
}

function randomCard() {
  return cardPool[Math.floor(Math.random() * cardPool.length)];
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

  // Larghezza massima se limitati dallo spazio verticale
  const availH = H - 2 * margin;
  const widthFromHeight = availH / CARD_RATIO;

  const cardWidth = Math.max(0, Math.min(widthFromWidth, widthFromHeight));
  const cardHeight = cardWidth * CARD_RATIO;

  canvas.style.padding = margin + 'px';
  canvas.style.gap = gap + 'px';
  // Se le carte escono dallo schermo si parte da sinistra, altrimenti si centrano
  const totalWidth = n * cardWidth + (n - 1) * gap + 2 * margin;
  canvas.style.justifyContent = totalWidth > W + 0.5 ? 'flex-start' : 'center';

  cards.forEach(card => {
    card.style.width = cardWidth + 'px';
    card.style.height = cardHeight + 'px';
    card.style.borderRadius = (cardWidth * 0.05) + 'px';
  });

  updateResolveMarker();
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

  const W = zoom.clientWidth;
  const H = zoom.clientHeight;
  const margin = Math.min(W, H) * 0.05;
  const width = Math.max(0, Math.min(W - 2 * margin, (H - 2 * margin) / CARD_RATIO));
  big.style.width = width + 'px';
  big.style.height = (width * CARD_RATIO) + 'px';
  big.style.borderRadius = (width * 0.05) + 'px';
}

function openZoom(card) {
  const big = document.createElement('div');
  big.className = 'card';
  big.style.backgroundImage = card.style.backgroundImage;
  zoom.replaceChildren(big);
  zoom.hidden = false;
  layoutZoom();
}

function closeZoom() {
  zoom.hidden = true;
  zoom.replaceChildren();
}

function addCard() {
  const card = document.createElement('div');
  card.className = 'card';
  const data = randomCard();
  card.dataset.id = data.id;
  card.style.backgroundImage = `url("${encodeURI(data.image)}")`;
  canvas.appendChild(card);
  layout();
  centerQueue();
}

// Se la coda esce dallo schermo, mostra il suo centro (carte tagliate in modo uguale ai lati)
function centerQueue() {
  const left = Math.max(0, (canvas.scrollWidth - canvas.clientWidth) / 2);
  canvas.scrollLeft = left;
}

// Reset: coda vuota, nessuna carta
function reset() {
  canvas.querySelectorAll('.card').forEach(card => card.remove());
  canvas.scrollLeft = 0;
  layout();
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

  // Testo del pulsante: "Ok" sulla carta appena pescata, "Risolta e Pesca" sull'ultima carta della coda
  if (newIndex >= 0) {
    resolveBtn.textContent = 'Ok';
  } else if (currentIndex === cards.length - 1) {
    resolveBtn.textContent = 'Risolta e Pesca';
  } else {
    resolveBtn.textContent = 'Risolta';
  }

  // Risolta / Risolta e Pesca valgono solo per la carta da risolvere, non per una che si sta solo guardando.
  // Ok (dopo la pesca) è sempre attivo, qualunque carta si stia guardando.
  resolveBtn.disabled = newIndex < 0 && viewIndex !== currentIndex;
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
  const total = canvas.querySelectorAll('.card').length;
  addCard();
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
  layout();
  centerQueue();
}

function nemesisTurn() {
  startResolution();
}

// "Risolta" / "Risolta e Pesca" / "Ok"
function resolveCurrent() {
  // Ok sulla carta appena pescata: ritorno alla VistaCoda
  if (newIndex >= 0) {
    endResolution();
    return;
  }

  const total = canvas.querySelectorAll('.card').length;
  if (currentIndex < total - 1) {
    currentIndex++;
    showCurrent();
    return;
  }

  // Ultima carta della coda risolta: si pesca la nuova carta e la si mostra
  drawNewCard();
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

nemesisBtn.addEventListener('click', nemesisTurn);
resetBtn.addEventListener('click', reset);
resolveBtn.addEventListener('click', resolveCurrent);
window.addEventListener('resize', () => {
  layout();
  layoutOverlay();
  layoutZoom();
});

// Avvio: legge cards.json; la coda parte vuota
async function init() {
  nemesisBtn.disabled = true;
  resetBtn.disabled = true;
  try {
    cardPool = await loadCardPool();
    if (cardPool.length === 0) throw new Error('Nessuna carta trovata in cards.json');
    nemesisBtn.disabled = false;
    resetBtn.disabled = false;
  } catch (err) {
    console.error(err);
    nemesisBtn.textContent = 'Errore: immagini non trovate';
  }
}

init();
