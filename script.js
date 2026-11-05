const canvas = document.getElementById('canvas');
const drawBtn = document.getElementById('draw-btn');
const resetBtn = document.getElementById('reset-btn');

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

drawBtn.addEventListener('click', addCard);
resetBtn.addEventListener('click', reset);
window.addEventListener('resize', layout);

// Avvio: legge l'elenco delle immagini, poi mostra la prima carta
async function init() {
  drawBtn.disabled = true;
  resetBtn.disabled = true;
  try {
    cardImages = await loadImageList();
    if (cardImages.length === 0) throw new Error('Nessuna immagine trovata nella cartella Data');
    drawBtn.disabled = false;
    resetBtn.disabled = false;
    addCard();
  } catch (err) {
    console.error(err);
    drawBtn.textContent = 'Errore: immagini non trovate';
  }
}

init();
