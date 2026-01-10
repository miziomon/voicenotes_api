# 📝 CHANGES.md - Registro delle Modifiche

Questo file documenta tutte le modifiche apportate al progetto **Voicenotes API** in ordine cronologico inverso (le modifiche più recenti sono in alto).

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

**Ultimo aggiornamento**: 10 Gennaio 2026
