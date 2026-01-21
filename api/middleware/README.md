# 🛡️ Middleware di Sicurezza - Supabase Proxy

Questa cartella contiene i middleware di sicurezza implementati per proteggere l'endpoint Supabase Proxy.

## 📁 Struttura

```
middleware/
├── tableWhitelist.js      # Validazione whitelist/blacklist tabelle
└── methodProtection.js    # Protezione da metodi SQL pericolosi
```

## 🔐 Architettura di Sicurezza

I middleware vengono applicati nell'ordine seguente nell'endpoint `/v1/supabase-proxy`:

```javascript
router.post(
    '/supabase-proxy',
    proxyLimiter,                    // 1. Rate Limiting (50 req/min)
    validaInput(supabaseProxySchema), // 2. Validazione Schema Joi
    protectFromDangerousMethods,     // 3. Blocco Metodi Pericolosi
    validateTableAccess,             // 4. Whitelist/Blacklist Tabelle
    async (req, res) => { ... }      // 5. Forwarding a Supabase
);
```

## 📋 Dettagli Middleware

### 1. `tableWhitelist.js`

**Funzione:** Controlla che le richieste accedano solo a tabelle autorizzate.

**Configurazione (.env):**
```env
# Whitelist (vuota = tutte permesse)
PROXY_TABLES_WHITELIST=notes,chat_sessions,chat_messages,usage_metrics

# Blacklist (vuota = nessuna bloccata)
PROXY_TABLES_BLACKLIST=internal_logs,system_config
```

**Logica:**
1. ✋ Se tabella in **BLACKLIST** → BLOCCA (priorità assoluta)
2. ✅ Se **WHITELIST vuota** → PERMETTI (tutte le tabelle)
3. ✅ Se **WHITELIST popolata** e tabella nella lista → PERMETTI
4. ✋ Altrimenti → BLOCCA

**Estrazione tabella:**
- Analizza path `/rest/v1/{table_name}`
- Fallback su `body.table` o `body.tableName`
- Case-insensitive

**Errore restituito:**
```json
{
  "errore": "Accesso Negato",
  "messaggio": "Non hai i permessi per accedere a questa risorsa",
  "dettagli": "La tabella 'xyz' non è nella whitelist",
  "tabella": "xyz",
  "codice": "TABLE_ACCESS_DENIED",
  "timestamp": "2026-01-21T14:00:00.000Z"
}
```

**Funzioni esportate:**
- `validateTableAccess(req, res, next)` - Middleware Express
- `isTableAllowed(tableName)` - Verifica autorizzazione
- `extractTableName(path)` - Estrae nome tabella
- `WHITELIST` - Array tabelle whitelist
- `BLACKLIST` - Array tabelle blacklist

---

### 2. `methodProtection.js`

**Funzione:** Blocca l'esecuzione di metodi SQL pericolosi.

**Metodi bloccati (hardcoded):**
- `TRUNCATE` - Svuota tabelle
- `DROP` - Elimina tabelle/database
- `ALTER` - Modifica schema
- `CREATE` - Crea oggetti database
- `GRANT` - Modifica permessi
- `REVOKE` - Rimuove permessi

**Metodi custom (.env):**
```env
PROXY_BLOCKED_METHODS=EXECUTE,CALL,INVOKE
```

**Rilevamento:**
- Analizza metodo HTTP
- Scansiona body per keyword SQL
- Controlla campi `query`, `sql`, `rawQuery`, `command`
- Verifica RPC calls (`body.rpc`, `body.function`)

**Pattern rilevati:**
```sql
TRUNCATE TABLE ...
DROP DATABASE ...
ALTER SCHEMA ...
CREATE INDEX ...
etc.
```

**Errore restituito:**
```json
{
  "errore": "Operazione Non Consentita",
  "messaggio": "La richiesta contiene operazioni non permesse",
  "dettagli": "Rilevato comando SQL pericoloso: TRUNCATE",
  "metodoBlocco": "TRUNCATE",
  "codice": "DANGEROUS_METHOD_BLOCKED",
  "timestamp": "2026-01-21T14:00:00.000Z"
}
```

**Logging critico:**
Ogni tentativo viene loggato con:
- IP richiedente
- Metodo rilevato
- Path richiesta
- Snippet body (primi 200 char)

**Funzioni esportate:**
- `protectFromDangerousMethods(req, res, next)` - Middleware Express
- `detectDangerousMethod(req)` - Analizza richiesta
- `BLOCKED_METHODS` - Array metodi bloccati

---

## 🧪 Testing

Usa il file `supabase_proxy_tests.http` per testare:

**Test Whitelist:**
```http
### Dovrebbe funzionare se 'notes' è in whitelist
POST http://localhost:3000/v1/supabase-proxy
{
  "method": "GET",
  "path": "/rest/v1/notes",
  "query": { "select": "*" }
}
```

**Test Blacklist:**
```http
### Dovrebbe fallire se 'internal_logs' è in blacklist
POST http://localhost:3000/v1/supabase-proxy
{
  "method": "GET",
  "path": "/rest/v1/internal_logs"
}
```

**Test Metodi Pericolosi:**
```http
### Dovrebbe fallire con 403
POST http://localhost:3000/v1/supabase-proxy
{
  "method": "POST",
  "path": "/rest/v1/notes",
  "body": { "query": "TRUNCATE TABLE notes" }
}
```

---

## 📊 Logging

**Livelli:**
- `INFO` - Accesso consentito
- `WARN` - Accesso negato
- `ERROR` - Tentativo operazione pericolosa
- `DEBUG` - Dettagli validazione

**Formato:**
```
[21-01-2026 14:30:45] [WARN]: [TableWhitelist] ACCESSO NEGATO - Tabella: xyz, IP: 192.168.1.1, Motivo: ...
[21-01-2026 14:30:50] [ERROR]: [MethodProtection] ⚠️ TENTATIVO DI OPERAZIONE PERICOLOSA BLOCCATO!
```

---

## 🔧 Manutenzione

### Aggiungere nuova tabella in whitelist
Modifica `.env`:
```env
PROXY_TABLES_WHITELIST=notes,chat_sessions,nuova_tabella
```

### Bloccare nuovo metodo SQL
Modifica `.env`:
```env
PROXY_BLOCKED_METHODS=EXECUTE,CALL,NUOVO_METODO
```

Oppure modifica `methodProtection.js` per aggiungere metodi hardcoded in `ALWAYS_BLOCKED_METHODS`.

### Debug validazione tabella
```javascript
const { isTableAllowed } = require('./middleware/tableWhitelist');
const result = isTableAllowed('notes');
console.log(result); // { allowed: true/false, reason: '...' }
```

---

## 📄 Licenza

Parte del progetto **Voicenotes API** - MIT License

**Versione:** 1.4.0
**Data:** 21 Gennaio 2026
