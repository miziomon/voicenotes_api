# 🧪 Guida ai Test Automatici - Voicenotes API

Questa guida spiega come eseguire i test automatici per l'API Voicenotes, inclusi i nuovi test per il Supabase Proxy.

---

## 📋 Prerequisiti

Prima di eseguire i test, assicurati di aver installato le dipendenze:

```bash
npm install
```

---

## 🚀 Comandi per Eseguire i Test

### 1. Eseguire TUTTI i test con coverage

```bash
npm test
```

**Cosa fa:**
- Esegue tutti i file `.test.js` nella cartella `tests/`
- Genera un report di code coverage
- Mostra quali linee di codice sono coperte dai test
- Salva il report in `coverage/`

**Output atteso:**
```
Test Suites: 2 passed, 2 total
Tests:       51 passed, 1 skipped, 52 total
Snapshots:   0 total
Time:        ~5s
```

---

### 2. Eseguire i test in modalità watch (sviluppo)

```bash
npm run test:watch
```

**Cosa fa:**
- Esegue i test e rimane in ascolto
- Ri-esegue i test automaticamente quando modifichi i file
- Utile durante lo sviluppo

**Per uscire:** Premi `Q`

---

### 3. Eseguire SOLO i test del Proxy

```bash
npx jest tests/proxy.test.js
```

**Cosa fa:**
- Esegue solo i 11 test del Supabase Proxy
- Non genera coverage
- Più veloce per test rapidi

---

### 4. Eseguire SOLO i test principali (senza proxy)

```bash
npx jest tests/api.test.js
```

**Cosa fa:**
- Esegue solo i test degli endpoint principali
- Esclude i test del proxy

---

### 5. Eseguire un singolo test specifico

```bash
npx jest -t "POST /v1/supabase-proxy deve esistere"
```

**Cosa fa:**
- Esegue solo il test con quel nome specifico
- Utile per debugging di un test specifico

---

### 6. Vedere il coverage dettagliato

Dopo aver eseguito `npm test`, apri il report HTML:

```bash
# Windows
start coverage/lcov-report/index.html

# Linux/Mac
open coverage/lcov-report/index.html
```

---

## 📊 Test del Supabase Proxy

Il file `tests/proxy.test.js` contiene **11 test** che verificano:

### ✅ Test di Validazione (4 test)
1. **Esistenza endpoint** - Verifica che `/v1/supabase-proxy` risponda
2. **Body vuoto** - Verifica defaults (method=GET, path=/rest/v1/)
3. **Method non valido** - Deve restituire 400
4. **Path troppo lungo** - Deve restituire 400 (>500 char)

### ✅ Test di Sicurezza (3 test)
5. **Protezione TRUNCATE** - Deve bloccare con 403
6. **Protezione DROP** - Deve bloccare con 403
7. **Security headers** - Verifica X-Content-Type-Options, X-Frame-Options, etc.

### ✅ Test di Funzionalità (4 test)
8. **Method GET valido** - Deve essere accettato
9. **Struttura risposta** - Verifica success, statusCode, data, headers, duration, timestamp
10. **Duration** - Deve restituire tempo di elaborazione
11. **CORS headers** - Verifica Access-Control-Allow-Origin

---

## 🔍 Interpretare i Risultati

### Output di Successo

```
 PASS  tests/proxy.test.js
  API V1 - Endpoint Supabase Proxy (/v1/supabase-proxy)
    ✓ POST /v1/supabase-proxy deve esistere (45 ms)
    ✓ POST /v1/supabase-proxy con body vuoto deve usare defaults (23 ms)
    ✓ POST /v1/supabase-proxy con method non valido deve restituire errore 400 (18 ms)
    ✓ POST /v1/supabase-proxy con path > 500 caratteri deve restituire errore 400 (15 ms)
    ✓ POST /v1/supabase-proxy con method=GET deve essere accettato (87 ms)
    ✓ POST /v1/supabase-proxy con TRUNCATE nel body deve essere bloccato con 403 (12 ms)
    ✓ POST /v1/supabase-proxy con DROP nel body deve essere bloccato con 403 (11 ms)
    ✓ POST /v1/supabase-proxy deve restituire duration (25 ms)
    ✓ POST /v1/supabase-proxy deve restituire struttura response completa (31 ms)
    ✓ POST /v1/supabase-proxy deve includere security headers (14 ms)
    ✓ POST /v1/supabase-proxy deve includere CORS headers (10 ms)

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```

### Output di Fallimento

```
 FAIL  tests/proxy.test.js
  API V1 - Endpoint Supabase Proxy (/v1/supabase-proxy)
    ✕ POST /v1/supabase-proxy con TRUNCATE nel body deve essere bloccato con 403 (25 ms)

  ● API V1 - Endpoint Supabase Proxy › POST /v1/supabase-proxy con TRUNCATE nel body deve essere bloccato con 403

    expect(received).toHaveProperty(path, value)

    Expected path: "codice"
    Expected value: "DANGEROUS_METHOD_BLOCKED"

    Received value: "VALIDATION_ERROR"
```

**Cosa fare:** Il test mostra esattamente cosa si aspettava e cosa ha ricevuto.

---

## 🐛 Debugging

### I test falliscono con "Cannot find Supabase credentials"

**Causa:** Mancano le variabili d'ambiente.

**Soluzione:**
```bash
# Assicurati che .env esista e contenga:
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### I test sono lenti

**Causa:** Connessione Supabase lenta o timeout elevati.

**Soluzione:** I test in ambiente `NODE_ENV=test` non dovrebbero chiamare Supabase realmente.

### "Port 3000 already in use"

**Causa:** Un server è già in esecuzione.

**Soluzione:**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /F /PID <PID>

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

---

## 📈 Coverage Report

Il coverage mostra quali linee di codice sono testate:

```
----------------------|---------|----------|---------|---------|-------------------
File                  | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------------|---------|----------|---------|---------|-------------------
All files             |   85.23 |    78.45 |   91.23 |   86.12 |
 middleware           |   94.12 |    88.23 |     100 |   95.45 |
  methodProtection.js |   96.15 |    91.67 |     100 |   97.22 | 142,167
  tableWhitelist.js   |   92.31 |    85.71 |     100 |   93.75 | 87,112
 routes               |   82.34 |    72.45 |   88.89 |   84.56 |
  v1.js               |   82.34 |    72.45 |   88.89 |   84.56 | 234-245,456-478
 services             |   78.92 |    65.43 |   85.71 |   80.12 |
  supabaseProxy.js    |   81.25 |    68.75 |   87.50 |   82.50 | 189-205,287-301
----------------------|---------|----------|---------|---------|-------------------
```

**Obiettivo:** >80% di coverage è considerato buono.

---

## ✅ Checklist Pre-Deploy

Prima di fare deploy su Vercel, assicurati che:

- [ ] Tutti i test passano (`npm test`)
- [ ] Coverage >80%
- [ ] Nessun warning critico
- [ ] File `.env` configurato su Vercel
- [ ] Test proxy funzionanti

---

## 🔧 Configurazione Jest

Il file `package.json` contiene la configurazione Jest:

```json
{
  "jest": {
    "testEnvironment": "node",
    "coverageDirectory": "coverage",
    "collectCoverageFrom": [
      "api/**/*.js",
      "!api/index.js"
    ],
    "testMatch": [
      "**/tests/**/*.test.js"
    ],
    "verbose": true
  }
}
```

---

## 📚 Risorse

- **Documentazione Jest:** https://jestjs.io/docs/getting-started
- **Documentazione Supertest:** https://github.com/visionmedia/supertest
- **Coverage Reports:** Apri `coverage/lcov-report/index.html`

---

**Versione:** 1.4.0
**Data:** 21 Gennaio 2026
**Test Totali:** 58 (47 principali + 11 proxy)
