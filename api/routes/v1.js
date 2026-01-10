/**
 * ==============================================
 * Routes API Versione 1 (/v1)
 * ==============================================
 *
 * Questo file contiene tutte le route della versione 1
 * dell'API. Le route sono raggruppate in un router Express
 * e poi montate sul path /v1 nel file principale.
 *
 * Endpoint disponibili:
 * - GET /v1/test - Endpoint di test
 * - GET /v1/health - Health check per monitoraggio
 *
 * @author Voicenotes API Team
 * @version 1.1.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

// Importiamo il Router di Express per creare un gruppo di route
const express = require('express');
const router = express.Router();

// Importiamo il logger per la registrazione degli eventi
const { logger } = require('../utils/logger');

// Importiamo il rate limiter per le API versionate
const { apiLimiter } = require('../utils/rateLimiter');

// Importiamo il validatore per la validazione degli input
const { validaInput, sanitizzaInput, schemas } = require('../utils/validator');

// ============================================
// VARIABILI PER MONITORAGGIO UPTIME
// ============================================

// Timestamp di avvio del server (per calcolare uptime)
const startTime = Date.now();

// Contatore delle richieste processate
let richiesteProcessate = 0;

// ============================================
// MIDDLEWARE SPECIFICI PER V1
// ============================================

// Applichiamo il rate limiter a tutte le route v1
router.use(apiLimiter);

// Applichiamo la sanitizzazione automatica degli input
router.use(sanitizzaInput);

// Middleware per contare le richieste
router.use((req, res, next) => {
    richiesteProcessate++;
    next();
});

// ============================================
// ENDPOINT: GET /v1/test
// ============================================

/**
 * Endpoint di test versione 1
 *
 * Route: GET /v1/test
 * Descrizione: Endpoint per verificare che l'API sia funzionante
 *
 * Query Parameters (opzionali):
 * - message: Messaggio personalizzato da includere nella risposta
 * - format: Formato della risposta ('json' o 'text')
 *
 * Risposta JSON:
 * {
 *   "result": true,
 *   "version": "1",
 *   "message": "..." (se fornito)
 * }
 */
router.get('/test', validaInput(schemas.testQuery, 'query'), (req, res) => {
    // Logghiamo la richiesta ricevuta
    logger.info(`Richiesta /v1/test - Query params: ${JSON.stringify(req.query)}`);

    // Costruiamo l'oggetto di risposta base
    const risposta = {
        result: true,
        version: '1',
        timestamp: new Date().toISOString()
    };

    // Se è stato fornito un messaggio, lo includiamo nella risposta
    if (req.query.message) {
        risposta.message = req.query.message;
    }

    // Se il formato richiesto è 'text', restituiamo testo semplice
    if (req.query.format === 'text') {
        logger.info('Risposta /v1/test in formato text');
        return res.type('text/plain').send(`Test superato - Versione 1 - ${risposta.timestamp}`);
    }

    // Restituiamo la risposta JSON
    logger.info('Risposta /v1/test in formato JSON');
    res.status(200).json(risposta);
});

// ============================================
// ENDPOINT: GET /v1/health
// ============================================

/**
 * Endpoint Health Check versione 1
 *
 * Route: GET /v1/health
 * Descrizione: Endpoint per monitoraggio uptime e stato del servizio
 *
 * Questo endpoint fornisce informazioni dettagliate sullo stato
 * del servizio, utili per sistemi di monitoraggio esterni
 * come UptimeRobot, Pingdom, etc.
 *
 * Risposta JSON:
 * {
 *   "status": "healthy",
 *   "uptime": { ... },
 *   "memoria": { ... },
 *   "timestamp": "..."
 * }
 */
router.get('/health', (req, res) => {
    // Calcoliamo l'uptime del server
    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);

    // Otteniamo informazioni sull'uso della memoria
    const memoriaUsata = process.memoryUsage();

    // Costruiamo l'oggetto di risposta con tutte le informazioni
    const healthInfo = {
        // Stato generale del servizio
        status: 'healthy',
        versione: '1.1.0',
        ambiente: process.env.NODE_ENV || 'development',

        // Informazioni sull'uptime
        uptime: {
            avvio: new Date(startTime).toISOString(),
            durata: {
                giorni: uptimeDays,
                ore: uptimeHours % 24,
                minuti: uptimeMinutes % 60,
                secondi: uptimeSeconds % 60
            },
            durataSecondiTotali: uptimeSeconds
        },

        // Statistiche sulle richieste
        statistiche: {
            richiesteProcessate: richiesteProcessate
        },

        // Informazioni sulla memoria (in MB)
        memoria: {
            heapUsato: Math.round(memoriaUsata.heapUsed / 1024 / 1024 * 100) / 100,
            heapTotale: Math.round(memoriaUsata.heapTotal / 1024 / 1024 * 100) / 100,
            rss: Math.round(memoriaUsata.rss / 1024 / 1024 * 100) / 100,
            unita: 'MB'
        },

        // Informazioni sul sistema
        sistema: {
            nodeVersion: process.version,
            piattaforma: process.platform,
            architettura: process.arch
        },

        // Timestamp della risposta
        timestamp: new Date().toISOString()
    };

    // Logghiamo la richiesta health check
    logger.info(`Health check eseguito - Status: ${healthInfo.status}`);

    // Restituiamo le informazioni di health
    res.status(200).json(healthInfo);
});

// ============================================
// ENDPOINT: GET /v1/info
// ============================================

/**
 * Endpoint Informazioni API versione 1
 *
 * Route: GET /v1/info
 * Descrizione: Fornisce informazioni sulla versione 1 dell'API
 */
router.get('/info', (req, res) => {
    logger.info('Richiesta /v1/info');

    res.status(200).json({
        nome: 'Voicenotes API',
        versione: '1',
        versioneCompleta: '1.1.0',
        descrizione: 'API minimali con Express per Vercel',
        endpoints: {
            test: {
                path: '/v1/test',
                metodo: 'GET',
                descrizione: 'Endpoint di test che restituisce { result: true }',
                parametri: {
                    message: 'Messaggio opzionale da includere nella risposta',
                    format: 'Formato risposta: json (default) o text'
                }
            },
            health: {
                path: '/v1/health',
                metodo: 'GET',
                descrizione: 'Health check per monitoraggio uptime'
            },
            info: {
                path: '/v1/info',
                metodo: 'GET',
                descrizione: 'Informazioni sulla versione API'
            }
        },
        documentazione: 'Vedi README.md per documentazione completa',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// ESPORTAZIONE DEL ROUTER
// ============================================

// Esportiamo il router per montarlo nel file principale
module.exports = router;
