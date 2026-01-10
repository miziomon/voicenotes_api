/**
 * ==============================================
 * API Minimali con Express per Vercel
 * ==============================================
 *
 * Questo file contiene il server Express principale
 * con tutte le funzionalità:
 * - Rate limiting per protezione da abusi
 * - Logging su file con rotazione giornaliera
 * - Validazione input con Joi
 * - API versionate (/v1)
 * - Endpoint health check
 *
 * Struttura dell'applicazione:
 * - Inizializzazione di Express
 * - Configurazione dei middleware
 * - Montaggio delle routes versionate
 * - Avvio del server (solo in ambiente locale)
 *
 * @author Voicenotes API Team
 * @version 1.1.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

// Importiamo Express, il framework web per Node.js
const express = require('express');

// Importiamo il sistema di logging personalizzato
const { logger, httpLogger } = require('./utils/logger');

// Importiamo i rate limiters
const { globalLimiter } = require('./utils/rateLimiter');

// Importiamo il middleware di sanitizzazione
const { sanitizzaInput } = require('./utils/validator');

// Importiamo le routes versionate
const v1Routes = require('./routes/v1');

// ============================================
// INIZIALIZZAZIONE DELL'APPLICAZIONE
// ============================================

// Creiamo un'istanza dell'applicazione Express
const app = express();

// Definiamo la porta su cui il server ascolterà
const PORT = process.env.PORT || 3000;

// Timestamp di avvio per calcolare l'uptime globale
const serverStartTime = Date.now();

// ============================================
// CONFIGURAZIONE TRUST PROXY (IMPORTANTE PER VERCEL)
// ============================================

// Abilitiamo il trust del proxy per ottenere l'IP reale del client
// Questo è necessario quando l'app è dietro un reverse proxy (Vercel, Nginx, etc.)
app.set('trust proxy', 1);

// ============================================
// MIDDLEWARE GLOBALI
// ============================================

// Middleware per il logging HTTP di tutte le richieste
// Deve essere il primo middleware per loggare tutte le richieste
app.use(httpLogger);

// Middleware per il parsing del JSON nelle richieste
app.use(express.json({
    // Limite dimensione body a 1MB per sicurezza
    limit: '1mb'
}));

// Middleware per il parsing dei dati URL-encoded
app.use(express.urlencoded({
    extended: true,
    limit: '1mb'
}));

// Middleware di sanitizzazione globale degli input
app.use(sanitizzaInput);

// Middleware CORS (Cross-Origin Resource Sharing)
app.use((req, res, next) => {
    // Permettiamo richieste da qualsiasi origine
    res.header('Access-Control-Allow-Origin', '*');

    // Specifichiamo gli header permessi
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    // Specifichiamo i metodi HTTP permessi
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    // Aggiungiamo header di sicurezza base
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');

    // Se la richiesta è di tipo OPTIONS (preflight), rispondiamo con 200
    if (req.method === 'OPTIONS') {
        return res.status(200).json({});
    }

    next();
});

// Applichiamo il rate limiter globale a tutte le richieste
app.use(globalLimiter);

// ============================================
// MONTAGGIO ROUTES VERSIONATE
// ============================================

// Montiamo le routes della versione 1 sul path /v1
// Tutti gli endpoint definiti in v1.js saranno accessibili come /v1/...
app.use('/v1', v1Routes);

// Logghiamo l'avvenuto montaggio delle routes
logger.info('Routes v1 montate su /v1');

// ============================================
// ENDPOINT ROOT (/)
// ============================================

/**
 * Endpoint root GET
 *
 * Route: GET /
 * Descrizione: Endpoint principale che fornisce informazioni sull'API
 */
app.get('/', (req, res) => {
    logger.info('Richiesta ricevuta sulla root /');

    res.status(200).json({
        messaggio: 'Benvenuto nelle API Voicenotes',
        versione: '1.1.0',
        versioniAPI: {
            v1: {
                base: '/v1',
                endpoints: ['/v1/test', '/v1/health', '/v1/info']
            }
        },
        endpointsLegacy: {
            test: '/test - Endpoint di test (legacy)',
            apiTest: '/api/test - Endpoint alternativo (legacy)',
            health: '/health - Health check globale'
        },
        documentazione: 'Vedi README.md e CHANGES.md per informazioni complete',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// ENDPOINT LEGACY (retrocompatibilità)
// ============================================

/**
 * Endpoint di test GET (legacy)
 *
 * Route: GET /test
 * Descrizione: Endpoint legacy per retrocompatibilità
 */
app.get('/test', (req, res) => {
    logger.info('Richiesta ricevuta su /test (legacy)');

    res.status(200).json({
        result: true,
        nota: 'Questo è un endpoint legacy. Usa /v1/test per la versione più recente.'
    });
});

/**
 * Endpoint di test alternativo (legacy)
 *
 * Route: GET /api/test
 */
app.get('/api/test', (req, res) => {
    logger.info('Richiesta ricevuta su /api/test (legacy)');

    res.status(200).json({
        result: true,
        nota: 'Questo è un endpoint legacy. Usa /v1/test per la versione più recente.'
    });
});

// ============================================
// ENDPOINT HEALTH CHECK GLOBALE
// ============================================

/**
 * Endpoint Health Check globale
 *
 * Route: GET /health
 * Descrizione: Health check semplificato per monitoraggio rapido
 *
 * Questo endpoint non ha rate limiting per permettere
 * ai servizi di monitoraggio di funzionare sempre.
 */
app.get('/health', (req, res) => {
    // Calcoliamo l'uptime
    const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);

    logger.info('Health check globale eseguito');

    res.status(200).json({
        status: 'healthy',
        versione: '1.1.0',
        uptime: uptimeSeconds,
        uptimeFormattato: formatUptime(uptimeSeconds),
        timestamp: new Date().toISOString()
    });
});

// ============================================
// FUNZIONI DI UTILITÀ
// ============================================

/**
 * Formatta l'uptime in formato leggibile
 *
 * @param {number} secondi - Uptime in secondi
 * @returns {string} Uptime formattato (es. "2g 3h 15m 30s")
 */
function formatUptime(secondi) {
    const giorni = Math.floor(secondi / 86400);
    const ore = Math.floor((secondi % 86400) / 3600);
    const minuti = Math.floor((secondi % 3600) / 60);
    const sec = secondi % 60;

    const parti = [];
    if (giorni > 0) parti.push(`${giorni}g`);
    if (ore > 0) parti.push(`${ore}h`);
    if (minuti > 0) parti.push(`${minuti}m`);
    parti.push(`${sec}s`);

    return parti.join(' ');
}

// ============================================
// GESTIONE ERRORI 404 (Not Found)
// ============================================

/**
 * Middleware per gestire le richieste a endpoint non esistenti
 */
app.use((req, res) => {
    logger.warn(`Endpoint non trovato: ${req.method} ${req.path}`);

    res.status(404).json({
        errore: 'Endpoint non trovato',
        percorso: req.path,
        metodo: req.method,
        suggerimento: 'Controlla la documentazione per gli endpoint disponibili',
        endpointsDisponibili: [
            '/',
            '/health',
            '/test',
            '/v1/test',
            '/v1/health',
            '/v1/info'
        ],
        codice: 'NOT_FOUND'
    });
});

// ============================================
// GESTIONE ERRORI GLOBALE
// ============================================

/**
 * Middleware per la gestione degli errori non catturati
 */
app.use((err, req, res, next) => {
    // Logghiamo l'errore completo
    logger.error(`Errore non gestito: ${err.message}`, {
        stack: err.stack,
        path: req.path,
        method: req.method
    });

    // Restituiamo una risposta di errore generica
    res.status(500).json({
        errore: 'Errore interno del server',
        messaggio: process.env.NODE_ENV === 'production'
            ? 'Si è verificato un errore. Riprova più tardi.'
            : err.message,
        codice: 'INTERNAL_ERROR'
    });
});

// ============================================
// AVVIO DEL SERVER (SOLO IN AMBIENTE LOCALE)
// ============================================

if (require.main === module) {
    app.listen(PORT, () => {
        console.log('');
        console.log('='.repeat(60));
        console.log('🚀 SERVER API VOICENOTES AVVIATO CON SUCCESSO!');
        console.log('='.repeat(60));
        console.log('');
        console.log(`📍 Server in ascolto su: http://localhost:${PORT}`);
        console.log('');
        console.log('📌 ENDPOINT DISPONIBILI:');
        console.log('   ├── GET /              → Informazioni API');
        console.log('   ├── GET /health        → Health check globale');
        console.log('   ├── GET /test          → Test legacy');
        console.log('   │');
        console.log('   └── API v1:');
        console.log('       ├── GET /v1/test   → Endpoint test v1');
        console.log('       ├── GET /v1/health → Health check v1');
        console.log('       └── GET /v1/info   → Info API v1');
        console.log('');
        console.log('⚙️  FUNZIONALITÀ ATTIVE:');
        console.log('   ├── Rate Limiting (100 req/15min globale)');
        console.log('   ├── Logging su file (rotazione giornaliera)');
        console.log('   ├── Validazione input con Joi');
        console.log('   └── Sanitizzazione automatica');
        console.log('');
        console.log('='.repeat(60));
        console.log('Premi CTRL+C per terminare il server');
        console.log('='.repeat(60));
        console.log('');

        logger.info(`Server avviato su porta ${PORT}`);
    });
}

// ============================================
// ESPORTAZIONE DEL MODULO
// ============================================

module.exports = app;
