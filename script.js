const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const nemesisBtn = document.getElementById('nemesis-btn');
const resetBtn = document.getElementById('reset-btn');
const resolveBtn = document.getElementById('resolve-btn');
const controls = document.querySelector('.controls');
const viewMarker = document.getElementById('view-marker');

// Rapporto carta standard: 63 x 88 mm
const CARD_RATIO = 88 / 63;

// Oltre questo numero di carte la dimensione resta fissa e si scorre di lato
const MAX_VISIBLE = 5;

// Spazio (px) lasciato ai lati della carta ingrandita per la scritta NUOVA
const LABEL_SPACE = 30;

// Distanza minima (px) di uno slide per cambiare carta in VistaRisoluzione
const SWIPE_MIN_DISTANCE = 50;

// Repository GitHub da cui leggere l'elenco delle immagini nella cartella Data
const GITHUB_OWNER = 'lorenzvittori';
const GITHUB_REPO = 'AeonsEnd_APP';
const DATA_FOLDER = 'Data';

// Riempito automaticamente all'avvio con i file .png/.jpg/.jpeg della cartella Data
let cardImages = [];

// Stato della VistaRisoluzione (false = VistaCoda)
let resolving = false;
// Carta da risolvere (bordo bianco): cambia solo con "Risolta"
let currentIndex = 0;
// Carta mostrata ingrandita: cambia anche con lo slide, senza risolvere nulla
let viewIndex = 0;

async function loadImageList() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FOLDER}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Impossibile leggere la cartella Data (' + res.status + ')');
  const files = await res.json();
  return files
    .filter(f => f.type === 'file' && /\.(png|jpe?g)$/i.test(f.name))
    .map(f => DATA_FOLDER + '/' + encodeURIComponent(f.name));
}

function randomImage() {
  return cardImages[Math.floor(Math.random() * cardImages.length)];
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

  updateViewMarker();
}

// Lineetta sotto la carta mostrata ingrandita, nella fascia della coda (solo in VistaRisoluzione)
function updateViewMarker() {
  const card = canvas.querySelectorAll('.card')[viewIndex];
  if (!resolving || !card) {
    viewMarker.hidden = true;
    return;
  }
  viewMarker.hidden = false;
  viewMarker.style.left = (card.offsetLeft + card.offsetWidth * 0.2) + 'px';
  viewMarker.style.width = (card.offsetWidth * 0.6) + 'px';
  viewMarker.style.top = (card.offsetTop + card.offsetHeight + 4) + 'px';
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

function addCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.backgroundImage = `url("${randomImage()}")`;
  canvas.appendChild(card);
  layout();
  centerQueue();
}

// Se la coda esce dallo schermo, mostra il suo centro (carte tagliate in modo uguale ai lati)
function centerQueue() {
  const left = Math.max(0, (canvas.scrollWidth - canvas.clientWidth) / 2);
  canvas.scrollLeft = left;
}

function reset() {
  canvas.querySelectorAll('.card').forEach(card => card.remove());
  canvas.scrollLeft = 0;
  addCard();
}

// VistaRisoluzione: segna nella coda la carta da risolvere (bordo bianco) e la porta in vista
function markCurrent() {
  const cards = canvas.querySelectorAll('.card');
  cards.forEach((card, i) => card.classList.toggle('current', i === currentIndex));
  cards[currentIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

// VistaRisoluzione: mostra ingrandita la carta viewIndex
function showBig() {
  const cards = canvas.querySelectorAll('.card');
  const big = document.createElement('div');
  big.className = 'card';
  big.style.backgroundImage = cards[viewIndex].style.backgroundImage;

  // L'ultima carta della coda è quella appena aggiunta
  if (viewIndex === cards.length - 1) {
    const label = document.createElement('span');
    label.className = 'new-label';
    label.textContent = 'NUOVA';
    big.appendChild(label);
  }

  overlay.replaceChildren(big);
  layoutOverlay();

  // Si può risolvere solo la carta da risolvere, non una che si sta solo guardando
  resolveBtn.disabled = viewIndex !== currentIndex;
  updateViewMarker();
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
  canvas.classList.add('resolving');
  overlay.hidden = false;
  nemesisBtn.hidden = true;
  resetBtn.hidden = true;
  resolveBtn.hidden = false;
  // La coda si restringe in alto: ricalcola la dimensione delle carte
  layout();
  showCurrent();
}

// Ritorno alla VistaCoda
function endResolution() {
  resolving = false;
  canvas.classList.remove('resolving');
  canvas.querySelectorAll('.card.current').forEach(card => card.classList.remove('current'));
  overlay.replaceChildren();
  overlay.hidden = true;
  nemesisBtn.hidden = false;
  resetBtn.hidden = false;
  resolveBtn.hidden = true;
  layout();
  centerQueue();
}

function nemesisTurn() {
  addCard();
  startResolution();
}

function resolveCurrent() {
  currentIndex++;
  if (currentIndex < canvas.querySelectorAll('.card').length) {
    showCurrent();
  } else {
    endResolution();
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

nemesisBtn.addEventListener('click', nemesisTurn);
resetBtn.addEventListener('click', reset);
resolveBtn.addEventListener('click', resolveCurrent);
window.addEventListener('resize', () => {
  layout();
  layoutOverlay();
});

// Avvio: legge l'elenco delle immagini, poi mostra la prima carta
async function init() {
  nemesisBtn.disabled = true;
  resetBtn.disabled = true;
  try {
    cardImages = await loadImageList();
    if (cardImages.length === 0) throw new Error('Nessuna immagine trovata nella cartella Data');
    nemesisBtn.disabled = false;
    resetBtn.disabled = false;
    addCard();
  } catch (err) {
    console.error(err);
    nemesisBtn.textContent = 'Errore: immagini non trovate';
  }
}

init();
