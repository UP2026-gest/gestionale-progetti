# Gestionale Progetti — UP · MSF · Studio Piazza

App web per la gestione condivisa dei progetti commerciali tra soci.

## Funzioni principali

- **Lista progetti** con filtri per società, responsabile, stato, scadenza
- **Vista Kanban** per stato del progetto
- **Dashboard** con statistiche e win rate
- **Pannello laterale** per ogni progetto con azioni, note e storico modifiche
- **Azioni progressive** per progetto, ognuna con scadenza, responsabile e note
- **Popup scadenze** all'apertura + reminder automatico ogni 15 minuti
- **Export CSV** compatibile con Excel
- **Salvataggio su GitHub** — ogni modifica è un commit con autore

---

## Setup iniziale

### 1. Crea il repository

1. Vai su [github.com](https://github.com) e accedi con l'account `UP2026-gest`
2. Crea un nuovo repository pubblico chiamato `gestionale-progetti`
3. Inizializza con un README

### 2. Attiva GitHub Pages

1. Vai su **Settings → Pages**
2. In *Source* seleziona **Deploy from a branch**
3. Scegli branch `main`, cartella `/ (root)`
4. Clicca **Save**
5. Dopo qualche minuto l'app sarà disponibile all'indirizzo:
   `https://UP2026-gest.github.io/gestionale-progetti/`

### 3. Carica i file

Carica tutti questi file nel repository (puoi farlo dalla UI di GitHub o tramite git):

```
index.html
style.css
app.js
progetti_iniziali.json
README.md
```

### 4. Crea il Personal Access Token

Ogni socio deve creare il proprio token **una volta sola**:

1. Su GitHub: **Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Clicca **Generate new token (classic)**
3. Nome: `gestionale-progetti`
4. Scadenza: scegli `No expiration` (o 1 anno)
5. Spunta **repo** (tutto il gruppo)
6. Clicca **Generate token** e copia il codice (`ghp_...`)

> ⚠️ Il token viene mostrato una sola volta — salvalo in un posto sicuro.

### 5. Primo accesso

1. Apri l'app all'indirizzo GitHub Pages
2. Seleziona il tuo nome
3. Incolla il token nel campo apposito
4. Il token viene salvato localmente nel browser — non dovrai reinserirlo
5. Al primo accesso il file `progetti.json` viene creato automaticamente su GitHub

---

## Utilizzo quotidiano

- **Clicca una riga** nella lista per aprire il pannello laterale del progetto
- **Aggiungi azioni** dal pannello con scadenza, responsabile e note
- **Spunta l'azione** per segnarla come completata
- **Modifica progetto** dal bottone in alto nel pannello
- **Filtri** nella barra in alto per trovare rapidamente i progetti
- **Popup scadenze** appare automaticamente all'apertura e ogni 15 minuti se ci sono scadenze imminenti

---

## Note tecniche

- I dati sono salvati in `progetti.json` nel repository
- Ogni salvataggio è un commit — avete uno storico completo di ogni modifica
- In caso di salvataggio simultaneo, il secondo riceve un avviso e i dati vengono ricaricati
- Il token GitHub non lascia mai il tuo browser — non viene trasmesso ad alcun server esterno

---

## Struttura dati (`progetti.json`)

```json
{
  "progetti": [
    {
      "id": "p001",
      "societa": "UP",
      "oggetto": "Nome progetto",
      "obiettivo": "...",
      "responsabile": "Renato",
      "proposta": "Sì",
      "stato": "Attesa riscontro",
      "inizio": "2026-03-01",
      "scadenza": "2026-04-01",
      "note": "...",
      "azioni": [
        {
          "id": "a123",
          "titolo": "Chiamare il cliente",
          "scadenza": "2026-03-25",
          "responsabile": "Renato",
          "note": "",
          "completata": false,
          "creato_da": "Renato",
          "creato_il": "2026-03-20"
        }
      ],
      "storia": [
        { "data": "2026-03-20", "utente": "Renato", "campo": "creazione", "da": "", "a": "Attesa riscontro" }
      ]
    }
  ]
}
```
