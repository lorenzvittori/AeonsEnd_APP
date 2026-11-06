# Cose da fare

Legenda: `[x]` fatto, `[ ]` da fare.

## Da fare

- [ ] Segnarsi quali boss interagiscono con il mazzo nemesi
- [ ] Aggiungere vita nemesi e vita città (servono i valori iniziali)

### Dubbi aperti
- [ ] Ci sono carte che guardano/mischiano il mazzo nemesi?
- [ ] Ci sono interazioni che permettono di aggiungere o togliere carte dal mazzo nemesi?

## Fatte

- Design:
  - [x] "NUOVA" sostituita da etichetta "NEW" (sulla carta in coda e su quella grande), glow dorato e carta che entra girandosi
  - [x] Carta da risolvere segnata con un glow rosso (al posto della lineetta)
  - [x] VistaCoda: scritta "Turno dei giocatori" in alto
  - [x] Glow bianco dietro la carta che si sta guardando (al posto della cornice bianca)
  - [x] Tolte le scritte di vita e token quando guardi una carta
  - [x] Tolta la scritta "DA RISOLVERE"
  - [x] Vita e token anche sopra le carte viste in grande
- [x] Comando "undo" in alto a sinistra: annulla l'ultima azione, più volte, fino all'inizio della partita
- [x] Durante la VistaRisoluzione si può toccare una carta della fascia in alto per vederla direttamente
- [x] La partita si salva nel browser del telefono a ogni azione; riaprendo il sito, "Riprendi partita" torna dove eri

- Poteri:
  - [x] Counter dei loro token (immagine del token sopra la carta, una per token rimasto)
  - [x] Durante la VistaCoda, pulsante per toglierli ("Rimuovi" toccando la carta)
  - [x] "Risolta" sostituito con "Togli 1 e vai avanti"
  - [x] Con un solo token: scritta "DA RISOLVERE" e pulsante "Risolto", che la elimina dalla coda e va avanti
- Minion:
  - [x] La loro vita (gocce da 5 e da 1 sopra la carta)
  - [x] Scritta "DA RISOLVERE"
  - [x] Il pulsante diventa "Va avanti"
  - [x] Durante la VistaCoda, modo per fargli danno e ucciderli (−5, −1, +1, "Uccidi" toccando la carta)
- Attacco:
  - [x] Scritta "DA RISOLVERE" + pulsante ("Risolto")
- [x] Pagina iniziale in cui si sceglie il numero di giocatori, il nemico e la battaglia
- [x] Mazzo nemesi (per Tier, da `deck-setup.json`) e pila degli scarti consultabile ("Scarti")
- [x] Counter dei turni nemesi
- [x] Scarto automatico delle carte dalla coda:
  - [x] Minion se la vita è <= 0
  - [x] Potere se:
    1. ho pagato durante il mio turno (VistaCoda, pulsante "Rimuovi")
    2. è arrivato a 0 token e ho risolto l'effetto ("Risolto")
  - [x] Attacco se ho risolto l'effetto appena è arrivato ("Risolto")
