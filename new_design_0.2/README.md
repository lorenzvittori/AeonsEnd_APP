# new_design_0.2

Prototipo del nuovo design: interfaccia rifatta secondo `REPORT_IMPLEMENTAZIONE.md` (kit di design v1.0),
sopra la logica di gioco della versione 48 (mazzo, pesca, scarti, poteri/minion/attacchi, turni e undo invariati).

- Sito: https://lorenzvittori.github.io/AeonsEnd_APP/new_design_0.2/
- File propri:
  - `index.html`, `script.js`, `version.json` (cache del prototipo: vale per tutti i CSS e per il JS)
  - `css/design-tokens.css` (colori, font Cinzel/Inter da Google Fonts, durate), `css/components.css` (componenti), `style.css` (layout)
  - `Assets/ui/icons/*.svg`, `Assets/ui/decor/card-back.svg` (icone e retro generico del kit), `Assets/*.webp` (gocce di vita del dialogo)
  - `thumbs/<id>.webp`: miniature della coda (264 x 369), generate da `tools/build-thumbs.py` (serve Pillow).
    Da rieseguire se cambiano `cards.json` o le immagini in `Data/`: `python new_design_0.2/tools/build-thumbs.py`
- Condivisi con l'app originale (letti da `../`): `cards.json`, `deck-setup.json`, `nemesis.json` e le scansioni in `Data/`
  (usate per la carta grande).
- La partita si salva nella chiave `aeonsend-clone-save-v2`, separata da quella dell'app originale; il formato è quello della v48.
