# 📡 Voicenotes API

## Descrizione

Sistema di API minimali realizzato con **Node.js** e **Express**, pronto per il deployment su **Vercel**.

Questo progetto include:
- ✅ Rate Limiting per protezione da abusi
- ✅ Logging su file con rotazione giornaliera
- ✅ Validazione input con Joi
- ✅ API versionate (`/v1`)
- ✅ Health Check per monitoraggio uptime
- ✅ Test automatici con Jest

---

## 📋 Indice

1. [Requisiti](#requisiti)
2. [Installazione](#installazione)
3. [Avvio in Sviluppo Locale](#avvio-in-sviluppo-locale)
4. [Endpoint Disponibili](#endpoint-disponibili)
5. [Rate Limiting](#rate-limiting)
6. [Sistema di Logging](#sistema-di-logging)
7. [Validazione Input](#validazione-input)
8. [Test Automatici](#test-automatici)
9. [Deployment su Vercel](#deployment-su-vercel)
10. [Struttura del Progetto](#struttura-del-progetto)
11. [Risoluzione Problemi](#risoluzione-problemi)

---

## 📌 Requisiti

Prima di iniziare, assicurati di avere installato:

| Requisito | Versione Minima | Verifica |
|-----------|-----------------|----------|
| **Node.js** | 18.0.0 o superiore | `node --version` |
| **npm** | 8.0.0 o superiore | `npm --version` |
| **Git** | Qualsiasi versione recente | `git --version` |

### Requisiti Opzionali

- **Vercel CLI** - Per il deployment da linea di comando
  ```bash
  npm install -g vercel
  ```

---

## 🚀 Installazione

### Passo 1: Clona il Repository

```bash
# Clona il repository dal tuo account GitHub
git clone https://github.com/TUO_USERNAME/voicenotes-api.git

# Entra nella cartella del progetto
cd voicenotes-api
```

### Passo 2: Installa le Dipendenze

```bash
# Installa tutte le dipendenze definite in package.json
npm install
```

---

## 💻 Avvio in Sviluppo Locale

### Metodo 1: Avvio diretto con Node.js

```bash
# Avvia il server Express direttamente
npm run dev
```

Il server sarà disponibile su: `http://localhost:3000`

### Metodo 2: Avvio con Vercel Dev (consigliato)

```bash
# Avvia l'ambiente di sviluppo Vercel
npm run vercel-dev
```

### Output Atteso

```
==================================================
🚀 SERVER API VOICENOTES AVVIATO CON SUCCESSO!
==================================================

📍 Server in ascolto su: http://localhost:3000

📌 ENDPOINT DISPONIBILI:
   ├── GET /              → Informazioni API
   ├── GET /health        → Health check globale
   ├── GET /test          → Test legacy
   │
   └── API v1:
       ├── GET /v1/test   → Endpoint test v1
       ├── GET /v1/health → Health check v1
       └── GET /v1/info   → Info API v1

⚙️  FUNZIONALITÀ ATTIVE:
   ├── Rate Limiting (100 req/15min globale)
   ├── Logging su file (rotazione giornaliera)
   ├── Validazione input con Joi
   └── Sanitizzazione automatica
```

---

## 📍 Endpoint Disponibili

### API Versione 1 (Consigliata)

#### 1. Test API v1

| Proprietà | Valore |
|-----------|--------|
| **URL** | `GET /v1/test` |
| **Descrizione** | Verifica che l'API sia funzionante |
| **Rate Limit** | 30 richieste/minuto |

**Query Parameters:**
| Parametro | Tipo | Descrizione |
|-----------|------|-------------|
| `message` | string | Messaggio opzionale da includere (max 200 caratteri) |
| `format` | string | Formato risposta: `json` (default) o `text` |

**Esempio richiesta:**
```bash
curl "http://localhost:3000/v1/test?message=Ciao"
```

**Esempio risposta:**
```json
{
  "result": true,
  "version": "1",
  "message": "Ciao",
  "timestamp": "2026-01-10T12:00:00.000Z"
}
```

---

#### 2. Health Check v1

| Proprietà | Valore |
|-----------|--------|
| **URL** | `GET /v1/health` |
| **Descrizione** | Informazioni dettagliate sullo stato del servizio |
| **Rate Limit** | Nessuno (escluso) |

**Esempio risposta:**
```json
{
  "status": "healthy",
  "versione": "1.1.0",
  "ambiente": "development",
  "uptime": {
    "avvio": "2026-01-10T10:00:00.000Z",
    "durata": {
      "giorni": 0,
      "ore": 2,
      "minuti": 30,
      "secondi": 15
    }
  },
  "statistiche": {
    "richiesteProcessate": 1250
  },
  "memoria": {
    "heapUsato": 25.5,
    "heapTotale": 50.0,
    "rss": 75.3,
    "unita": "MB"
  },
  "sistema": {
    "nodeVersion": "v18.17.0",
    "piattaforma": "win32",
    "architettura": "x64"
  }
}
```

---

#### 3. Info API v1

| Proprietà | Valore |
|-----------|--------|
| **URL** | `GET /v1/info` |
| **Descrizione** | Informazioni sulla versione 1 dell'API |

---

### Endpoint Legacy (Retrocompatibilità)

Questi endpoint sono mantenuti per retrocompatibilità ma è consigliato usare la versione `/v1`.

| Endpoint | Descrizione |
|----------|-------------|
| `GET /` | Informazioni generali sull'API |
| `GET /test` | Test legacy (restituisce `{ result: true }`) |
| `GET /api/test` | Alternativo legacy |
| `GET /health` | Health check semplificato |

---

## 🛡️ Rate Limiting

Il sistema implementa tre livelli di rate limiting:

### Rate Limiter Globale

| Configurazione | Valore |
|----------------|--------|
| Richieste massime | 100 |
| Finestra temporale | 15 minuti |
| Endpoint esclusi | `/health`, `/v1/health` |

### Rate Limiter API (v1)

| Configurazione | Valore |
|----------------|--------|
| Richieste massime | 30 |
| Finestra temporale | 1 minuto |

### Headers di Risposta

Ogni risposta include headers informativi:

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1704888000
```

### Risposta quando il limite è superato

```json
{
  "errore": "Troppe richieste",
  "messaggio": "Hai superato il limite di richieste consentite. Riprova tra qualche minuto.",
  "limite": "100 richieste ogni 15 minuti",
  "codice": "RATE_LIMIT_EXCEEDED"
}
```

---

## 📝 Sistema di Logging

Il sistema utilizza Winston per il logging avanzato su file.

### Caratteristiche

- **Rotazione giornaliera**: nuovo file ogni giorno
- **Pulizia automatica**: eliminazione file > 30 giorni
- **Compressione**: file archiviati compressi in gzip
- **Separazione per livello**: file separati per errori e richieste HTTP

### File di Log Generati

| File | Contenuto |
|------|-----------|
| `logs/combined-YYYY-MM-DD.log` | Tutti i log (info+) |
| `logs/error-YYYY-MM-DD.log` | Solo errori |
| `logs/http-YYYY-MM-DD.log` | Richieste HTTP |
| `logs/exceptions-YYYY-MM-DD.log` | Eccezioni non gestite |

### Pulizia Manuale

```bash
# Esegui pulizia manuale dei log
npm run clean:logs
```

### Formato Log

```
[10-01-2026 12:30:45] [INFO]: Server avviato su porta 3000
[10-01-2026 12:31:00] [HTTP]: GET /v1/test | Status: 200 | Tempo: 15ms | IP: 127.0.0.1
```

---

## ✅ Validazione Input

Il sistema utilizza Joi per la validazione degli input.

### Schemi Disponibili

| Schema | Descrizione | Regole |
|--------|-------------|--------|
| `string` | Stringa generica | 1-500 caratteri, trim automatico |
| `nome` | Nomi/titoli | 2-100 caratteri, lettere/numeri/spazi/trattini |
| `email` | Email | Formato valido, lowercase automatico |
| `url` | URL | http/https valido |
| `id` | Identificatori | Alfanumerico, 1-50 caratteri |

### Sanitizzazione Automatica

Tutti gli input vengono automaticamente sanitizzati per prevenire attacchi XSS:

- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&#x27;`
- `/` → `&#x2F;`

### Esempio Errore Validazione

```json
{
  "errore": "Dati non validi",
  "messaggio": "I dati forniti non superano la validazione",
  "dettagli": [
    {
      "campo": "message",
      "messaggio": "message non può superare 200 caratteri",
      "tipo": "string.max"
    }
  ],
  "codice": "VALIDATION_ERROR"
}
```

---

## 🧪 Test Automatici

Il progetto include una suite completa di test con Jest e Supertest.

### Eseguire i Test

```bash
# Esegui tutti i test con coverage
npm test

# Esegui test in modalità watch (sviluppo)
npm run test:watch
```

### Test Inclusi

- ✅ Endpoint Root (`/`)
- ✅ Endpoint Test Legacy (`/test`, `/api/test`)
- ✅ Health Check (`/health`, `/v1/health`)
- ✅ API v1 (`/v1/test`, `/v1/info`)
- ✅ Validazione parametri query
- ✅ Gestione errori 404
- ✅ CORS Headers
- ✅ Rate Limit Headers
- ✅ Security Headers

### Esempio Output Test

```
PASS  tests/api.test.js
  Endpoint Root (/)
    ✓ GET / deve restituire status 200 (25 ms)
    ✓ GET / deve contenere messaggio di benvenuto (8 ms)
  API V1 - Endpoint Test (/v1/test)
    ✓ GET /v1/test deve restituire result: true (12 ms)
    ✓ GET /v1/test?message=ciao deve includere il messaggio (9 ms)
    ✓ GET /v1/test?format=text deve restituire text/plain (10 ms)
    ...

Test Suites: 1 passed, 1 total
Tests:       20 passed, 20 total
Coverage:    92%
```

---

## ☁️ Deployment su Vercel

### Metodo 1: Deployment Automatico tramite GitHub

1. **Crea un repository su GitHub**
   ```bash
   git init
   git add .
   git commit -m "feat: API Express v1.1.0 con rate limiting e logging"
   git branch -M main
   git remote add origin https://github.com/TUO_USERNAME/voicenotes-api.git
   git push -u origin main
   ```

2. **Collega a Vercel**
   - Vai su [vercel.com](https://vercel.com)
   - Clicca su "New Project"
   - Seleziona il repository GitHub appena creato
   - Clicca su "Deploy"

3. **URL finale**
   - Riceverai un URL del tipo: `https://voicenotes-api.vercel.app`

### Metodo 2: Deployment da Linea di Comando

```bash
# Installa Vercel CLI
npm install -g vercel

# Esegui il login
vercel login

# Esegui il deployment (preview)
vercel

# Deployment in produzione
vercel --prod
```

---

## 📁 Struttura del Progetto

```
voicenotes-api/
│
├── api/
│   ├── index.js              # 📄 Server Express principale
│   ├── routes/
│   │   └── v1.js             # 📄 Routes API versione 1
│   └── utils/
│       ├── logger.js         # 📄 Sistema di logging Winston
│       ├── rateLimiter.js    # 📄 Configurazione rate limiting
│       └── validator.js      # 📄 Validazione e sanitizzazione
│
├── scripts/
│   └── clean-logs.js         # 📄 Script pulizia log manuale
│
├── tests/
│   └── api.test.js           # 📄 Test automatici Jest
│
├── logs/                     # 📁 Directory log (auto-generata)
│
├── .gitignore               # 📄 File da ignorare in Git
├── package.json             # 📄 Configurazione npm
├── vercel.json              # 📄 Configurazione Vercel
├── README.md                # 📄 Questa documentazione
└── CHANGES.md               # 📄 Registro delle modifiche
```

---

## 🔧 Risoluzione Problemi

### Problema: "Cannot find module 'express'"

**Soluzione:** Reinstalla le dipendenze
```bash
rm -rf node_modules
npm install
```

### Problema: "Port 3000 is already in use"

**Soluzione:** Usa una porta diversa
```bash
PORT=3001 npm run dev
```

### Problema: Test falliscono

**Soluzione:** Assicurati che non ci sia un server in esecuzione e riavvia i test
```bash
npm test
```

### Problema: Rate limit raggiunto durante i test

**Soluzione:** I test usano supertest che non è soggetto al rate limit. Se hai problemi in sviluppo, attendi 15 minuti o modifica temporaneamente i limiti in `rateLimiter.js`.

### Problema: File di log non creati

**Soluzione:** La directory `logs/` viene creata automaticamente al primo avvio. Verifica i permessi di scrittura nella directory del progetto.

---

## 📄 Licenza

Questo progetto è distribuito con licenza MIT.

---

## 📝 Changelog

Vedi [CHANGES.md](./CHANGES.md) per il registro completo delle modifiche.

---

**Versione**: 1.1.0
**Data**: 10 Gennaio 2026
**Creato con ❤️ usando Node.js, Express e Vercel**
