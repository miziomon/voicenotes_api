# 📊 Comparazione: Chiamata Diretta vs Proxy Supabase

Questo documento mostra la differenza tra chiamare **direttamente Supabase** e passare attraverso il **Proxy Trasparente**.

**Scenario:** Ottenere le ultime 15 note ordinate per data di creazione (discendente)

---

## 🔵 METODO 1: Chiamata DIRETTA a Supabase

### HTTP Request Diretto

```http
GET https://rlopmhcucabvaezpmwsq.supabase.co/rest/v1/notes?select=*&order=created_at.desc&limit=15
Host: rlopmhcucabvaezpmwsq.supabase.co
apikey: sb_publishable_WBjCO5N1duRMw3i2bwvntw_WJV2X1qG
Authorization: Bearer sb_publishable_WBjCO5N1duRMw3i2bwvntw_WJV2X1qG
Content-Type: application/json
```

### Codice JavaScript/React (con @supabase/supabase-js)

```javascript
// Configurazione client Supabase DIRETTO
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rlopmhcucabvaezpmwsq.supabase.co',
  'sb_publishable_WBjCO5N1duRMw3i2bwvntw_WJV2X1qG'
);

// Chiamata per ottenere le ultime 15 note
const { data, error } = await supabase
  .from('notes')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(15);

console.log(data); // Array di 15 note
```

### Cosa succede sotto il cofano

1. ✅ Il client invia la richiesta HTTP direttamente a `rlopmhcucabvaezpmwsq.supabase.co`
2. ✅ Include l'`apikey` pubblica (`sb_publishable_...`) negli header
3. ⚠️  La **ANON KEY pubblica** è visibile nel network inspector
4. ⚠️  Le **RLS (Row Level Security)** di Supabase gestiscono i permessi
5. ⚠️  NON puoi usare operazioni che richiedono `SERVICE_ROLE_KEY`
6. ✅ Supabase risponde con le note

### Risposta

```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "user_id": "2198e343-eeeb-4361-be3b-7c8a826e193a",
    "title": "Nota importante",
    "transcription": "Contenuto della nota...",
    "created_at": "2026-01-21T14:00:00.000Z",
    "status": "completed",
    ...
  },
  {
    "id": "223e4567-e89b-12d3-a456-426614174001",
    ...
  }
  // ... altre 13 note
]
```

---

## 🟢 METODO 2: Chiamata TRAMITE PROXY

### HTTP Request al Proxy

```http
POST https://your-api.vercel.app/v1/supabase-proxy
Host: your-api.vercel.app
Content-Type: application/json

{
  "method": "GET",
  "path": "/rest/v1/notes",
  "query": {
    "select": "*",
    "order": "created_at.desc",
    "limit": "15"
  }
}
```

### Codice JavaScript/React (IDENTICO!)

```javascript
// Configurazione client Supabase TRAMITE PROXY
import { createClient } from '@supabase/supabase-js';

// ⚡ UNICA DIFFERENZA: L'URL punta al proxy invece che a Supabase
const supabase = createClient(
  'https://your-api.vercel.app/v1/supabase-proxy',  // ← Solo questo cambia!
  'qualsiasi-valore-placeholder'  // Verrà comunque sovrascritto dal proxy
);

// 🎯 IL CODICE È ESATTAMENTE IDENTICO AL METODO DIRETTO!
const { data, error } = await supabase
  .from('notes')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(15);

console.log(data); // Array di 15 note (IDENTICO)
```

### Cosa succede sotto il cofano

1. ✅ Il client invia la richiesta a `your-api.vercel.app/v1/supabase-proxy`
2. ✅ Il **proxy** riceve la richiesta e la analizza
3. 🛡️ **Middleware di sicurezza** (4 livelli):
   - Rate limiting (50 req/min)
   - Validazione schema Joi
   - Protezione metodi pericolosi (TRUNCATE, DROP, etc.)
   - Whitelist/Blacklist tabelle
4. 🔒 Il proxy **sostituisce** l'apikey con la `SERVICE_ROLE_KEY` (lato server, invisibile al client)
5. ➡️  Il proxy inoltra la richiesta a Supabase con i privilegi elevati
6. ⬅️  Supabase risponde al proxy
7. ✅ Il proxy restituisce la risposta al client **nello stesso formato**

### Risposta del Proxy

```json
{
  "success": true,
  "statusCode": 200,
  "statusText": "OK",
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "user_id": "2198e343-eeeb-4361-be3b-7c8a826e193a",
      "title": "Nota importante",
      "transcription": "Contenuto della nota...",
      "created_at": "2026-01-21T14:00:00.000Z",
      "status": "completed",
      ...
    },
    {
      "id": "223e4567-e89b-12d3-a456-426614174001",
      ...
    }
    // ... altre 13 note
  ],
  "headers": {
    "content-type": "application/json",
    "content-range": "0-14/100"
  },
  "duration": 234,
  "timestamp": "2026-01-21T14:18:00.000Z"
}
```

**⚠️ NOTA:** Se usi `@supabase/supabase-js`, il client estrae automaticamente solo il campo `data`, quindi la risposta che vedi nel codice è **identica** al metodo diretto!

---

## 📊 Tabella Comparativa

| Aspetto | Chiamata Diretta | Tramite Proxy |
|---------|------------------|---------------|
| **URL endpoint** | `https://xxx.supabase.co/rest/v1/notes` | `https://your-api.vercel.app/v1/supabase-proxy` |
| **Metodo HTTP** | `GET` | `POST` (wrapper) |
| **Headers** | `apikey`: ANON_KEY pubblica | Nessun header speciale (gestito dal proxy) |
| **Autenticazione** | ANON_KEY (pubblica) | SERVICE_ROLE_KEY (privata, lato server) |
| **RLS Supabase** | ✅ Applicate | ❌ Bypassate (SERVICE_ROLE) |
| **Sicurezza client** | ⚠️ Chiave esposta nel network | ✅ Chiave nascosta lato server |
| **Whitelist tabelle** | ❌ Non disponibile | ✅ Configurabile |
| **Protezione SQL** | ⚠️ Solo RLS Supabase | ✅ Middleware dedicato |
| **Rate limiting** | Limiti Supabase | ✅ 50 req/min personalizzato |
| **Codice React** | `supabase.from('notes').select()` | **IDENTICO** `supabase.from('notes').select()` |
| **Risposta data** | `[ {...}, {...}, ... ]` | **IDENTICO** `[ {...}, {...}, ... ]` |
| **Logging** | Solo Supabase Dashboard | ✅ Log locali + Supabase |
| **Latenza extra** | 0ms | ~50-150ms (forwarding) |

---

## 🔍 Confronto VISIVO Request/Response

### Chiamata Diretta (Network Inspector)

```
Request URL: https://rlopmhcucabvaezpmwsq.supabase.co/rest/v1/notes?select=*&order=created_at.desc&limit=15
Request Method: GET
Status Code: 200 OK

Request Headers:
  apikey: sb_publishable_WBjCO5N1duRMw3i2bwvntw_WJV2X1qG  ← VISIBILE!
  authorization: Bearer sb_publishable_WBjCO5N1duRMw3i2bwvntw_WJV2X1qG

Response:
  [{...}, {...}, ...] (15 note)
```

### Chiamata Tramite Proxy (Network Inspector)

```
Request URL: https://your-api.vercel.app/v1/supabase-proxy
Request Method: POST
Status Code: 200 OK

Request Headers:
  content-type: application/json
  (NO apikey visibile! 🔒)

Request Body:
  {
    "method": "GET",
    "path": "/rest/v1/notes",
    "query": {
      "select": "*",
      "order": "created_at.desc",
      "limit": "15"
    }
  }

Response:
  {
    "success": true,
    "statusCode": 200,
    "data": [{...}, {...}, ...],  ← Stessi 15 risultati!
    "duration": 234
  }
```

---

## 💡 Quando Usare il Proxy?

### ✅ USA IL PROXY quando:
- Vuoi nascondere la `SERVICE_ROLE_KEY` dal client
- Hai bisogno di operazioni privilegiate (bypassare RLS)
- Vuoi implementare whitelist/blacklist tabelle
- Vuoi logging centralizzato e controllo avanzato
- Vuoi protezione extra da metodi SQL pericolosi
- Necessiti rate limiting personalizzato

### ⚠️ USA CHIAMATA DIRETTA quando:
- L'app è completamente pubblica (solo lettura)
- Le RLS di Supabase sono sufficienti per la sicurezza
- Vuoi minimizzare la latenza (no hop extra)
- Non hai bisogno di funzionalità aggiuntive del proxy

---

## 🧪 Test LIVE: Prova con REST Client

### Test Chiamata Diretta
```http
### GET Diretta a Supabase (ultime 15 note)
GET https://rlopmhcucabvaezpmwsq.supabase.co/rest/v1/notes?select=*&order=created_at.desc&limit=15
apikey: sb_publishable_WBjCO5N1duRMw3i2bwvntw_WJV2X1qG
Authorization: Bearer sb_publishable_WBjCO5N1duRMw3i2bwvntw_WJV2X1qG
```

### Test Chiamata Proxy
```http
### POST Tramite Proxy (ultime 15 note)
POST http://localhost:3000/v1/supabase-proxy
Content-Type: application/json

{
  "method": "GET",
  "path": "/rest/v1/notes",
  "query": {
    "select": "*",
    "order": "created_at.desc",
    "limit": "15"
  }
}
```

---

## 🎯 Conclusione

**L'obiettivo del proxy è la TRASPARENZA:**

✨ **Per lo sviluppatore React:**
```javascript
// Prima (Diretto):
const supabase = createClient('https://xxx.supabase.co', 'ANON_KEY');

// Dopo (Proxy):
const supabase = createClient('https://your-api.vercel.app/v1/supabase-proxy', 'placeholder');

// ✅ Tutto il resto del codice rimane UGUALE!
```

✨ **Per l'utente finale:**
- Stesso comportamento
- Stessa velocità (quasi)
- Zero differenze visibili

✨ **Per la sicurezza:**
- `SERVICE_ROLE_KEY` nascosta ✅
- Whitelist tabelle ✅
- Protezione SQL ✅
- Logging avanzato ✅

---

**Versione:** 1.4.0
**Data:** 21 Gennaio 2026
