# 📝 CHANGES.md - Registro delle Modifiche

Questo file documenta tutte le modifiche apportate al progetto **Voicenotes API** in ordine cronologico inverso (le modifiche più recenti sono in alto).

---

## [1.3.1] - 12 Gennaio 2026

### 🔧 Semplificazione API e Rimozione Endpoint Legacy

#### Modifiche alla Risposta Root

L'endpoint root (`GET /`) ora restituisce solo la versione dell'API:

**Prima:**
```json
{
  "messaggio": "Benvenuto nelle API Voicenotes",
  "versione": "1.1.0",
  "versioniAPI": { ... },
  "endpointsLegacy": { ... },
  "documentazione": "...",
  "timestamp": "..."
}
```

**Ora:**
```json
{
  "versione": "1.3.1"
}
```

#### Endpoint Legacy Rimossi

I seguenti endpoint legacy sono stati **rimossi** e ora restituiscono **404 Not Found**:

| Endpoint Rimosso | Alternativa |
|------------------|-------------|
| `GET /test` | Usa `GET /v1/test` |
| `GET /api/test` | Usa `GET /v1/test` |
| `GET /health` | Usa `GET /v1/health` |

La risposta 404 include un suggerimento con gli endpoint disponibili:
```json
{
  "errore": "Endpoint non trovato",
  "percorso": "/test",
  "suggerimento": "Usa gli endpoint con prefisso /v1",
  "endpointsDisponibili": ["/", "/v1/test", "/v1/health", "/v1/info", "/v1/ask", "/v1/embeddings"],
  "codice": "NOT_FOUND"
}
```

#### Endpoint Disponibili (v1)

Tutti gli endpoint richiedono ora il prefisso `/v1`:

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/` | Restituisce solo la versione |
| GET | `/v1/test` | Endpoint di test |
| GET | `/v1/health` | Health check dettagliato |
| GET | `/v1/info` | Informazioni API |
| POST | `/v1/ask` | Assistente AI |
| POST | `/v1/embeddings` | Generazione embedding |

#### Configurazione Variabili Test

Aggiunta gestione sicura delle variabili di test:

- **`api_tests.http`**: Ora legge `TEST_USER_ID` dal file `.env` usando `$dotenv`
- **`.env.example`**: Nuovo file template con valori placeholder (committato in git)
- **`.env`**: File con valori reali (non committato, in `.gitignore`)

#### File Modificati

- `api/index.js` - Semplificata risposta root, rimossi endpoint legacy
- `tests/api.test.js` - Rimossi test legacy, aggiunti test 404
- `api_tests.http` - Aggiornato per usare variabili da `.env`
- `.env.example` - Nuovo file template
- `.gitignore` - Aggiunto `!.env.example` per committare il template

---

## [1.3.0] - 12 Gennaio 2026

### 🚀 Nuovo Endpoint: POST /v1/embeddings - Generazione Embedding Vettoriali

#### Descrizione
Implementato nuovo endpoint che replica il comportamento dello script Python `process_embeddings.py` per generare embedding vettoriali delle note vocali. Questo endpoint:
- Recupera le note con `status='completed'` e `embedding=NULL`
- Genera embedding utilizzando Google Gemini (`gemini-embedding-001`)
- Aggiorna il campo `embedding` nella tabella `notes` su Supabase

#### Endpoint
```
POST /v1/embeddings
Content-Type: application/json
```

#### Body della Richiesta (tutti i parametri sono opzionali)
```json
{
  "limit": 3,                                      // Max note da processare (1-50, default 3)
  "dryRun": false,                                 // Se true, simula senza scrivere (default false)
  "userId": "2198e343-eeeb-4361-be3b-7c8a826e193a" // Filtra per utente (opzionale)
}
```

#### Risposta
```json
{
  "result": true,
  "message": "Processate 3 note con successo",
  "stats": {
    "totalFound": 3,
    "processed": 3,
    "errors": 0,
    "skippedEmpty": 0,
    "skippedTooLong": 0,
    "apiCalls": 3
  },
  "duration": 4523,
  "timestamp": "2026-01-12T10:30:00.000Z"
}
```

#### Funzionalità Implementate

1. **Generazione Embedding con Gemini**
   - Modello: `gemini-embedding-001`
   - Dimensione vettore: **1536** (compatibile con pgvector)
   - Task type: `RETRIEVAL_DOCUMENT` (ottimizzato per indicizzazione documenti)

2. **Costruzione Testo Combinato**
   - Combina: `Title | Excerpt | Category | Tags | Content (transcription)`
   - Stessa logica dello script Python originale
   - Limite massimo testo: 8000 caratteri

3. **Modalità Dry-Run**
   - Parametro `dryRun: true` per testare senza modificare il database
   - Utile per verificare quali note verrebbero processate

4. **Filtro per Utente**
   - Parametro opzionale `userId` per processare solo le note di un utente specifico
   - Validazione UUID v4

5. **Logging Dettagliato**
   - Log generico su `combined-*.log` e `http-*.log` (come altre API)
   - **Log verboso dedicato** su `logs/embeddings.log` con:
     - Dettaglio di ogni nota processata
     - Note saltate (vuote o troppo lunghe)
     - Errori specifici
     - Report finale con statistiche

6. **Retry con Backoff Esponenziale**
   - Massimo 3 tentativi per errori temporanei
   - Backoff esponenziale (2s, 4s, 8s)
   - Non ritenta per errori di validazione/autenticazione

7. **Rate Limiting Specifico**
   - Utilizza `strictLimiter` (10 req/15min) per proteggere l'endpoint
   - Delay di 200ms tra le chiamate API per evitare rate limiting Gemini

#### Nuovi File
```
api/
└── services/
    └── embeddingService.js    # Servizio principale per /v1/embeddings
```

#### File Modificati
- `api/routes/v1.js` - Aggiunto endpoint e schema validazione
- `api_tests.http` - Aggiunti esempi di utilizzo

#### Statistiche Risposta

| Campo | Descrizione |
|-------|-------------|
| `totalFound` | Note trovate da processare |
| `processed` | Note processate con successo |
| `errors` | Note con errori |
| `skippedEmpty` | Note saltate (nessun contenuto) |
| `skippedTooLong` | Note saltate (testo > 8000 caratteri) |
| `apiCalls` | Numero chiamate API Gemini effettuate |

#### Codici Errore

| Codice | Descrizione |
|--------|-------------|
| `USER_ID_INVALID` | L'userId fornito non è un UUID valido |
| `SERVICE_UNAVAILABLE` | Servizio Embedding non disponibile |
| `INTERNAL_ERROR` | Errore interno generico |

#### Esempi Utilizzo (api_tests.http)

```http
### Processa 3 note (default)
POST {{baseUrl}}/v1/embeddings
Content-Type: application/json

{}

### Processa 10 note
POST {{baseUrl}}/v1/embeddings
Content-Type: application/json

{
  "limit": 10
}

### Modalità simulazione
POST {{baseUrl}}/v1/embeddings
Content-Type: application/json

{
  "limit": 5,
  "dryRun": true
}
```

---

## [1.2.0] - 10 Gennaio 2026

### 🚀 Nuovo Endpoint: POST /v1/ask - Assistente AI per Note Vocali

#### Descrizione
Implementato nuovo endpoint che permette di fare domande alle proprie note vocali utilizzando:
- **Ricerca semantica** tramite embedding Gemini e Supabase pgvector
- **Generazione risposte** contestualizzate con Google Gemini 2.0 Flash

#### Endpoint
```
POST /v1/ask
Content-Type: application/json
```

#### Body della Richiesta
```json
{
  "userId": "2198e343-eeeb-4361-be3b-7c8a826e193a",  // UUID v4 obbligatorio
  "query": "La tua domanda qui",                     // Obbligatorio, max 2000 caratteri
  "threshold": 0.7,                                  // Opzionale, 0.0-1.0 (default 0.7)
  "count": 5,                                        // Opzionale, 1-20 (default 5)
  "temperature": 0.7,                                // Opzionale, 0.0-1.0 (default 0.7)
  "maxTokens": 2048                                  // Opzionale, 100-4096 (default 2048)
}
```

#### Risposta
```json
{
  "success": true,
  "metadata": {
    "timestamp": "2026-01-10T22:00:00.000Z",
    "processingTimeMs": 1234,
    "query": "...",
    "userId": "...",
    "notesFound": 3,
    "model": "gemini-2.0-flash",
    "parameters": { ... },
    "cache": { ... }
  },
  "data": {
    "response": "Risposta dell'AI basata sulle note...",
    "contextNotes": [
      { "id": "...", "title": "...", "similarity": 0.85 }
    ]
  },
  "error": null
}
```

#### Funzionalità Implementate

1. **Ricerca Semantica**
   - Generazione embedding con `text-embedding-004`
   - Ricerca vettoriale tramite funzione RPC `match_notes` su Supabase
   - Soglia di similarità configurabile

2. **Generazione Risposte AI**
   - Utilizzo Gemini 2.0 Flash per risposte contestualizzate
   - System prompt ottimizzato per citare le fonti
   - Temperatura e lunghezza risposta configurabili

3. **Caching Embedding**
   - Cache LRU per query frequenti
   - TTL di 5 minuti
   - Riduce chiamate API e migliora performance

4. **Retry con Backoff Esponenziale**
   - Massimo 3 tentativi per errori temporanei
   - Backoff esponenziale (1s, 2s, 4s)
   - Non ritenta per errori di validazione/autenticazione

5. **Timeout Configurabili**
   - Timeout di 30 secondi per ogni operazione API
   - Previene richieste bloccate

6. **Validazione UUID**
   - Verifica che userId sia un UUID v4 valido
   - Messaggi di errore chiari in italiano

7. **Rate Limiting Specifico**
   - Limite più restrittivo (10 req/15min) per endpoint /v1/ask
   - Protegge da abusi delle API esterne

#### Nuove Dipendenze
- `@google/generative-ai@^0.21.0` - SDK Google Gemini
- `@supabase/supabase-js@^2.39.0` - Client Supabase
- `dotenv@^16.3.1` - Caricamento variabili ambiente
- `uuid@^9.0.1` - Validazione UUID

#### Nuovi File
```
api/
└── services/
    └── askService.js    # Servizio principale per /v1/ask
```

#### Variabili Ambiente Richieste
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGciOi...
GEMINI_API_KEY=AIza...
```

#### Codici Errore
| Codice | Descrizione |
|--------|-------------|
| `USER_ID_INVALID` | L'userId non è un UUID valido |
| `EMBEDDING_ERROR` | Errore generazione embedding |
| `SEARCH_ERROR` | Errore ricerca note su Supabase |
| `NO_NOTES_FOUND` | Nessuna nota rilevante trovata |
| `GENERATION_ERROR` | Errore generazione risposta Gemini |
| `SERVICE_UNAVAILABLE` | Servizio AI non disponibile |
| `INTERNAL_ERROR` | Errore interno generico |

---

## [1.1.3] - 10 Gennaio 2026

### 🐛 Fix Filesystem Read-Only Vercel

#### Problema
- Vercel utilizza un **filesystem read-only** nell'ambiente serverless
- Il tentativo di creare la directory `logs/` causava l'errore `ENOENT: no such file or directory, mkdir '/var/task/logs'`

#### Soluzione
- Modificato `api/utils/logger.js` per rilevare l'ambiente Vercel
- **In Vercel/produzione**: logging solo su console (nessuna scrittura su file)
- **In sviluppo locale**: logging su file con rotazione giornaliera (comportamento originale)

#### Dettagli Tecnici
- Rilevamento ambiente tramite variabili `VERCEL` e `VERCEL_ENV`
- Import dinamico di `winston-daily-rotate-file` solo quando necessario
- Gestione graceful degli errori di creazione directory

---

## [1.1.2] - 10 Gennaio 2026

### 🔧 Upgrade Node.js per Vercel

#### Modifiche al package.json
- **Aggiornato Node.js da `18.x` a `24.x`**: Vercel ha dismesso il supporto per Node.js 18.x, ora è richiesta la versione 24.x
- Questa modifica è necessaria per il corretto deployment su Vercel

#### Nota
- Il codice è compatibile con Node.js 24.x senza modifiche
- Tutti i test passano correttamente con la nuova versione

---

## [1.1.1] - 10 Gennaio 2026

### 🔧 Fix Compatibilità Vercel

#### Modifiche al package.json
- **Versione Node.js fissata a `18.x`**: cambiato da `>=18.0.0` a `18.x` per evitare warning su Vercel riguardo l'aggiornamento automatico quando viene rilasciata una nuova versione major di Node.js
- **Aggiornato supertest a `^7.1.3`**: la versione 6.x era deprecata, aggiornata alla versione supportata per eliminare i warning durante l'installazione

#### Warning Risolti
- `Warning: Detected "engines": { "node": ">=18.0.0" }` - risolto con versione specifica
- `npm warn deprecated supertest@6.3.4` - risolto aggiornando a v7.1.3+

#### Note
- I warning relativi a `inflight` e `glob` sono dipendenze transitive di Jest e non causano problemi di funzionamento
- Il deployment su Vercel ora procede senza warning critici

---

## [1.1.0] - 10 Gennaio 2026

### 🆕 Nuove Funzionalità

#### Rate Limiting
- **Implementato sistema di rate limiting** per proteggere l'API da abusi e attacchi DDoS di base
- Configurati tre livelli di limitazione:
  - **Rate Limiter Globale**: 100 richieste ogni 15 minuti per tutti gli endpoint
  - **Rate Limiter Strict**: 10 richieste ogni 15 minuti per endpoint sensibili (predisposto per uso futuro)
  - **Rate Limiter API**: 30 richieste al minuto per gli endpoint versionati `/v1/*`
- I messaggi di errore sono completamente in italiano
- L'endpoint `/health` è escluso dal rate limiting per permettere il monitoraggio continuo
- Aggiunti headers standard `RateLimit-*` nelle risposte per informare il client sui limiti

#### Sistema di Logging Avanzato
- **Implementato logging su file con Winston** con le seguenti caratteristiche:
  - **Rotazione giornaliera**: ogni giorno viene creato un nuovo file di log
  - **Separazione per tipologia**:
    - `combined-YYYY-MM-DD.log`: tutti i log di livello info e superiore
    - `error-YYYY-MM-DD.log`: solo errori
    - `http-YYYY-MM-DD.log`: log delle richieste HTTP
    - `exceptions-YYYY-MM-DD.log`: eccezioni non gestite
  - **Pulizia automatica**: i file più vecchi di 30 giorni vengono eliminati automaticamente
  - **Compressione**: i file archiviati vengono compressi in formato gzip
  - **Limite dimensione**: massimo 20MB per file prima della rotazione
- Creato **script di pulizia manuale** (`npm run clean:logs`) per eliminare log obsoleti
- Log su console colorato in ambiente di sviluppo per facilitare il debug

#### Endpoint Health Check
- **Nuovo endpoint `/health`** per monitoraggio uptime globale
- **Nuovo endpoint `/v1/health`** con informazioni dettagliate:
  - Stato del servizio (healthy/unhealthy)
  - Uptime formattato (giorni, ore, minuti, secondi)
  - Statistiche richieste processate
  - Utilizzo memoria (heap, RSS) in MB
  - Informazioni sistema (versione Node.js, piattaforma, architettura)
- Ideale per integrazione con servizi di monitoraggio (UptimeRobot, Pingdom, etc.)

#### Validazione Input con Joi
- **Implementata validazione completa degli input** utilizzando la libreria Joi
- Creati schemi di validazione predefiniti:
  - `string`: stringa generica (1-500 caratteri)
  - `nome`: nomi/titoli con caratteri speciali ammessi
  - `email`: validazione email con lowercase automatico
  - `url`: validazione URL (http/https)
  - `numeroPositivo`: numeri interi positivi
  - `id`: identificatori alfanumerici
  - `testQuery`: schema per i parametri query dell'endpoint test
- **Messaggi di errore completamente in italiano**
- **Sanitizzazione automatica**: escaping caratteri HTML pericolosi per prevenire XSS
- Middleware `sanitizzaInput` applicato globalmente a tutte le richieste

#### API Versionate
- **Implementato sistema di versionamento API** con struttura `/v1/*`
- Nuovi endpoint nella versione 1:
  - `GET /v1/test` - Endpoint di test con supporto parametri query
  - `GET /v1/health` - Health check dettagliato
  - `GET /v1/info` - Informazioni sulla versione API
- Gli endpoint legacy (`/test`, `/api/test`) rimangono funzionanti per retrocompatibilità
- Preparato per future versioni (`/v2/*`, etc.)

#### Test Automatici
- **Implementata suite di test completa** con Jest e Supertest
- Test coverage per tutti gli endpoint:
  - Endpoint root (`/`)
  - Endpoint legacy (`/test`, `/api/test`)
  - Health check globale (`/health`)
  - API v1 (`/v1/test`, `/v1/health`, `/v1/info`)
- Test per validazione input (parametri validi e non validi)
- Test per gestione errori 404
- Test per CORS headers
- Test per Rate Limit headers
- Test per Security headers
- Esecuzione: `npm test` (con coverage) o `npm run test:watch`

### 🔧 Modifiche Tecniche

#### Nuove Dipendenze
- `express-rate-limit@^7.1.5` - Rate limiting
- `winston@^3.11.0` - Logging avanzato
- `winston-daily-rotate-file@^4.7.1` - Rotazione giornaliera log
- `joi@^17.11.0` - Validazione input

#### Nuove DevDependencies
- `jest@^29.7.0` - Framework di test
- `supertest@^7.1.3` - Test HTTP

#### Nuovi File Creati
```
api/
├── routes/
│   └── v1.js                 # Routes API versione 1
└── utils/
    ├── logger.js             # Sistema di logging Winston
    ├── rateLimiter.js        # Configurazione rate limiting
    └── validator.js          # Validazione e sanitizzazione input

scripts/
└── clean-logs.js             # Script pulizia log manuale

tests/
└── api.test.js               # Test automatici Jest

logs/                         # Directory log (auto-creata)
```

#### File Modificati
- `package.json` - Aggiornato con nuove dipendenze e script
- `api/index.js` - Ristrutturato con nuovi middleware e routes
- `vercel.json` - Aggiornato routing per nuovi endpoint
- `.gitignore` - Aggiunta directory `logs/` e `coverage/`

### 🛡️ Sicurezza

- Aggiunti headers di sicurezza nelle risposte:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
- Implementata sanitizzazione automatica degli input per prevenire XSS
- Rate limiting per prevenire abusi e attacchi DDoS di base
- Limite dimensione body a 1MB per prevenire attacchi di tipo payload oversize

### 📝 Documentazione

- Aggiornato `README.md` con documentazione completa
- Creato `CHANGES.md` con registro dettagliato delle modifiche
- Tutti i file di codice commentati in italiano passo passo
- Aggiunta documentazione inline per ogni funzione e middleware

---

## [1.0.0] - 10 Gennaio 2026

### 🎉 Release Iniziale

#### Funzionalità Base
- **Creato progetto Express** per hosting su Vercel
- **Endpoint `/test`** che restituisce `{ "result": true }`
- **Endpoint `/api/test`** alternativo per compatibilità Vercel
- **Endpoint `/`** con informazioni sull'API

#### File Creati
- `package.json` - Configurazione npm con Express
- `api/index.js` - Server Express principale
- `vercel.json` - Configurazione deployment Vercel
- `.gitignore` - File da ignorare in Git
- `README.md` - Documentazione iniziale

#### Middleware Configurati
- Parsing JSON e URL-encoded
- CORS abilitato per tutti i domini
- Gestione errori 404

---

## Legenda Versioni

Il progetto segue il **Semantic Versioning** (SemVer):

- **MAJOR** (es. 2.0.0): Modifiche incompatibili con versioni precedenti
- **MINOR** (es. 1.1.0): Nuove funzionalità retrocompatibili
- **PATCH** (es. 1.0.1): Correzioni bug retrocompatibili

---

## Come Contribuire

1. Fai un fork del repository
2. Crea un branch per la tua feature (`git checkout -b feature/NuovaFeature`)
3. Committa le modifiche (`git commit -m 'Aggiunta NuovaFeature'`)
4. Aggiorna questo file CHANGES.md con le tue modifiche
5. Pusha il branch (`git push origin feature/NuovaFeature`)
6. Apri una Pull Request

---

**Ultimo aggiornamento**: 12 Gennaio 2026
