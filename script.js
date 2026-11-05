const canvas = document.getElementById('canvas');
const drawBtn = document.getElementById('draw-btn');

// Rapporto carta standard: 63 x 88 mm
const CARD_RATIO = 88 / 63;

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

  // Larghezza massima se limitati dallo spazio orizzontale
  const availW = W - 2 * margin - (n - 1) * gap;
  const widthFromWidth = availW / n;

  // Larghezza massima se limitati dallo spazio verticale
  const availH = H - 2 * margin;
  const widthFromHeight = availH / CARD_RATIO;

  const cardWidth = Math.max(0, Math.min(widthFromWidth, widthFromHeight));
  const cardHeight = cardWidth * CARD_RATIO;

  canvas.style.padding = margin + 'px';
  canvas.style.gap = gap + 'px';

  cards.forEach(card => {
    card.style.width = cardWidth + 'px';
    card.style.height = cardHeight + 'px';
    card.style.borderRadius = (cardWidth * 0.05) + 'px';
  });
}

function addCard() {
  const card = document.createElement('div');
  card.className = 'card';
  canvas.appendChild(card);
  layout();
}

drawBtn.addEventListener('click', addCard);
window.addEventListener('resize', layout);

// Stato iniziale: una carta visibile
addCard();
