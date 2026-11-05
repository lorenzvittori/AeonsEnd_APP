const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const nemesisBtn = document.getElementById('nemesis-btn');
const resetBtn = document.getElementById('reset-btn');
const resolveBtn = document.getElementById('resolve-btn');

// Rapporto carta standard: 63 x 88 mm
const CARD_RATIO = 88 / 63;

// Oltre questo numero di carte la dimensione resta fissa e si scorre di lato
const MAX_VISIBLE = 5;

// Repository GitHub da cui leggere l'elenco delle immagini nella cartella Data
const GITHUB_OWNER = 'lorenzvittori';
const GITHUB_REPO = 'AeonsEnd_APP';
const DATA_FOLDER = 'Data';

// Riempito automaticamente all'avvio con i file .png/.jpg/.jpeg della cartella Data
let cardImages = [];

// Stato della VistaRisoluzione (false = VistaCoda)
let resolving = false;
let currentIndex = 0;

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
  // Con carte che escono dallo schermo si parte da sinistra, altrimenti si centra
  canvas.style.justifyContent = n > MAX_VISIBLE ? 'flex-start' : 'center';

  cards.forEach(card => {
    card.style.width = cardWidth + 'px';
    card.style.height = cardHeight + 'px';
    card.style.borderRadius = (cardWidth * 0.05) + 'px';
  });
}

// Posiziona l'overlay sopra il canvas e ingrandisce la carta al centro
function layoutOverlay() {
  if (!resolving) return;

  const rect = canvas.getBoundingClientRect();
  overlay.style.left = rect.left + 'px';
  overlay.style.top = rect.top + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';

  const big = overlay.firstElementChild;
  if (!big) return;

  const margin = Math.min(rect.width, rect.height) * 0.05;
  const width = Math.max(0, Math.min(rect.width - 2 * margin, (rect.height - 2 * margin) / CARD_RATIO));
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
  // Porta in vista la carta appena aggiunta
  canvas.scrollTo({ left: canvas.scrollWidth, behavior: 'smooth' });
}

function reset() {
  canvas.innerHTML = '';
  canvas.scrollLeft = 0;
  addCard();
}

// VistaRisoluzione: mostra ingrandita la carta corrente della coda
function showCurrent() {
  const cards = canvas.querySelectorAll('.card');
  cards.forEach((card, i) => card.classList.toggle('current', i === currentIndex));

  const big = document.createElement('div');
  big.className = 'card';
  big.style.backgroundImage = cards[currentIndex].style.backgroundImage;
  overlay.replaceChildren(big);
  layoutOverlay();

  cards[currentIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

function startResolution() {
  resolving = true;
  currentIndex = 0;
  canvas.classList.add('resolving');
  overlay.hidden = false;
  nemesisBtn.hidden = true;
  resetBtn.hidden = true;
  resolveBtn.hidden = false;
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
