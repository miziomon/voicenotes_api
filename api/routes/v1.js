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
 * - GET  /v1/test   - Endpoint di test
 * - GET  /v1/health - Health check per monitoraggio
 * - GET  /v1/info   - Informazioni API
 * - POST /v1/ask    - Assistente AI per note vocali
 *
 * @author Voicenotes API Team
 * @version 1.2.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

const express = require('express');
const router = express.Router();

// Importiamo il logger per la registrazione degli eventi
const { logger } = require('../utils/logger');

// Importiamo il rate limiter per le API versionate
const { apiLimiter, strictLimiter } = require('../utils/rateLimiter');

// Importiamo il validatore per la validazione degli input
const { validaInput, sanitizzaInput, schemas, Joi, messaggiErrore } = require('../utils/validator');

// Importiamo il servizio Ask (lazy loading per evitare errori se env non configurato)
let askService = null;
const getAskServiceSafe = () => {
    if (!askService) {
        try {
            const { getAskService } = require('../services/askService');
            askService = getAskService();
        } catch (error) {
            logger.error(`Errore caricamento AskService: ${error.message}`);
            return null;
        }
    }
    return askService;
};

// Importiamo il servizio Embedding (lazy loading per evitare errori se env non configurato)
let embeddingService = null;
const getEmbeddingServiceSafe = () => {
    if (!embeddingService) {
        try {
            const { getEmbeddingService } = require('../services/embeddingService');
            embeddingService = getEmbeddingService();
        } catch (error) {
            logger.error(`Errore caricamento EmbeddingService: ${error.message}`);
            return null;
        }
    }
    return embeddingService;
};

// ============================================
// SCHEMA VALIDAZIONE PER /v1/ask
// ============================================

/**
 * Schema Joi per la validazione del body della richiesta /v1/ask
 *
 * Parametri richiesti:
 * - userId: UUID dell'utente
 * - query: Domanda da fare (1-2000 caratteri)
 *
 * Parametri opzionali:
 * - threshold: Soglia similarità (0.0-1.0, default 0.7)
 * - count: Numero max note (1-20, default 5)
 * - temperature: Creatività risposta (0.0-1.0, default 0.7)
 * - maxTokens: Lunghezza max risposta (100-4096, default 2048)
 */
const askSchema = Joi.object({
    // User ID - deve essere un UUID valido
    userId: Joi.string()
        .guid({ version: ['uuidv4'] })
        .required()
        .messages({
            ...messaggiErrore,
            'string.guid': 'userId deve essere un UUID v4 valido',
            'any.required': 'userId è un campo obbligatorio'
        }),

    // Query - domanda dell'utente
    query: Joi.string()
        .min(1)
        .max(2000)
        .trim()
        .required()
        .messages({
            ...messaggiErrore,
            'string.min': 'La query non può essere vuota',
            'string.max': 'La query non può superare 2000 caratteri',
            'any.required': 'query è un campo obbligatorio'
        }),

    // Threshold - soglia di similarità
    threshold: Joi.number()
        .min(0)
        .max(1)
        .default(0.7)
        .messages({
            ...messaggiErrore,
            'number.min': 'threshold deve essere almeno 0',
            'number.max': 'threshold non può superare 1'
        }),

    // Count - numero massimo di note
    count: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(5)
        .messages({
            ...messaggiErrore,
            'number.min': 'count deve essere almeno 1',
            'number.max': 'count non può superare 20'
        }),

    // Temperature - creatività della risposta
    temperature: Joi.number()
        .min(0)
        .max(1)
        .default(0.7)
        .messages({
            ...messaggiErrore,
            'number.min': 'temperature deve essere almeno 0',
            'number.max': 'temperature non può superare 1'
        }),

    // Max Tokens - lunghezza massima risposta
    maxTokens: Joi.number()
        .integer()
        .min(100)
        .max(4096)
        .default(2048)
        .messages({
            ...messaggiErrore,
            'number.min': 'maxTokens deve essere almeno 100',
            'number.max': 'maxTokens non può superare 4096'
        })
}).messages(messaggiErrore);

// ============================================
// SCHEMA VALIDAZIONE PER /v1/embeddings
// ============================================

/**
 * Schema Joi per la validazione del body della richiesta /v1/embeddings
 *
 * Parametri opzionali:
 * - limit: Numero massimo di note da processare (1-50, default 3)
 * - dryRun: Se true, simula senza scrivere sul database (default false)
 * - userId: UUID dell'utente per filtrare le note (opzionale)
 */
const embeddingsSchema = Joi.object({
    // Limit - numero massimo di note da processare
    limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(3)
        .messages({
            ...messaggiErrore,
            'number.min': 'limit deve essere almeno 1',
            'number.max': 'limit non può superare 50'
        }),

    // Dry Run - modalità simulazione
    dryRun: Joi.boolean()
        .default(false)
        .messages(messaggiErrore),

    // User ID - opzionale, deve essere un UUID valido se fornito
    userId: Joi.string()
        .guid({ version: ['uuidv4'] })
        .optional()
        .messages({
            ...messaggiErrore,
            'string.guid': 'userId deve essere un UUID v4 valido'
        })
}).messages(messaggiErrore);

// ============================================
// VARIABILI PER MONITORAGGIO UPTIME
// ============================================

const startTime = Date.now();
let richiesteProcessate = 0;
let richiesteAsk = 0;
let richiesteEmbeddings = 0;

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
 */
router.get('/test', validaInput(schemas.testQuery, 'query'), (req, res) => {
    logger.info(`Richiesta /v1/test - Query params: ${JSON.stringify(req.query)}`);

    const risposta = {
        result: true,
        version: '1',
        timestamp: new Date().toISOString()
    };

    if (req.query.message) {
        risposta.message = req.query.message;
    }

    if (req.query.format === 'text') {
        logger.info('Risposta /v1/test in formato text');
        return res.type('text/plain').send(`Test superato - Versione 1 - ${risposta.timestamp}`);
    }

    logger.info('Risposta /v1/test in formato JSON');
    res.status(200).json(risposta);
});

// ============================================
// ENDPOINT: POST /v1/ask
// ============================================

/**
 * Endpoint Assistente AI per Note Vocali
 *
 * Route: POST /v1/ask
 * Descrizione: Fa domande alle note vocali usando ricerca semantica e Gemini AI
 *
 * Body JSON richiesto:
 * {
 *   "userId": "uuid-v4",           // ID utente (obbligatorio)
 *   "query": "domanda",            // Domanda da fare (obbligatorio)
 *   "threshold": 0.7,              // Soglia similarità (opzionale, 0.0-1.0)
 *   "count": 5,                    // Max note da usare (opzionale, 1-20)
 *   "temperature": 0.7,            // Creatività risposta (opzionale, 0.0-1.0)
 *   "maxTokens": 2048              // Lunghezza max risposta (opzionale, 100-4096)
 * }
 *
 * Risposta JSON:
 * {
 *   "success": true/false,
 *   "metadata": { ... },
 *   "data": {
 *     "response": "risposta AI",
 *     "contextNotes": [...]
 *   },
 *   "error": null | { "code": "...", "message": "..." }
 * }
 */
router.post('/ask', strictLimiter, validaInput(askSchema, 'body'), async (req, res) => {
    richiesteAsk++;
    const requestStartTime = Date.now();

    logger.info(`Richiesta /v1/ask - User: ${req.body.userId}, Query: "${req.body.query.substring(0, 50)}..."`);

    try {
        // Ottieni il servizio Ask
        const service = getAskServiceSafe();

        if (!service) {
            logger.error('AskService non disponibile');
            return res.status(503).json({
                success: false,
                metadata: {
                    timestamp: new Date().toISOString(),
                    processingTimeMs: Date.now() - requestStartTime
                },
                data: null,
                error: {
                    code: 'SERVICE_UNAVAILABLE',
                    message: 'Il servizio AI non è attualmente disponibile. Verifica la configurazione delle variabili ambiente.'
                }
            });
        }

        // Esegui la richiesta
        const result = await service.ask({
            userId: req.body.userId,
            query: req.body.query,
            threshold: req.body.threshold,
            count: req.body.count,
            temperature: req.body.temperature,
            maxTokens: req.body.maxTokens
        });

        // Restituisci la risposta con lo status code appropriato
        const statusCode = result.success ? 200 : (result.error?.code === 'NO_NOTES_FOUND' ? 200 : 400);
        res.status(statusCode).json(result);

    } catch (error) {
        logger.error(`Errore /v1/ask: ${error.message}`);

        res.status(500).json({
            success: false,
            metadata: {
                timestamp: new Date().toISOString(),
                processingTimeMs: Date.now() - requestStartTime
            },
            data: null,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Si è verificato un errore interno. Riprova più tardi.'
            }
        });
    }
});

// ============================================
// ENDPOINT: POST /v1/embeddings
// ============================================

/**
 * Endpoint per la generazione di embedding delle note vocali
 *
 * Route: POST /v1/embeddings
 * Descrizione: Processa le note con status='completed' e embedding=NULL,
 *              generando embedding vettoriali con Google Gemini e
 *              aggiornando il campo embedding su Supabase.
 *
 * Body JSON (tutti opzionali):
 * {
 *   "limit": 3,                   // Max note da processare (1-50, default 3)
 *   "dryRun": false,              // Se true, simula senza scrivere (default false)
 *   "userId": "uuid-v4"           // Filtra per utente specifico (opzionale)
 * }
 *
 * Risposta JSON:
 * {
 *   "result": true/false,
 *   "message": "...",
 *   "stats": {
 *     "totalFound": 3,
 *     "processed": 3,
 *     "errors": 0,
 *     "skippedEmpty": 0,
 *     "skippedTooLong": 0,
 *     "apiCalls": 3
 *   },
 *   "duration": 1234
 * }
 */
router.post('/embeddings', strictLimiter, validaInput(embeddingsSchema, 'body'), async (req, res) => {
    richiesteEmbeddings++;
    const requestStartTime = Date.now();

    const { limit, dryRun, userId } = req.body;

    logger.info(`Richiesta /v1/embeddings - limit: ${limit}, dryRun: ${dryRun}, userId: ${userId || 'tutti'}`);

    try {
        // Ottieni il servizio Embedding
        const service = getEmbeddingServiceSafe();

        if (!service) {
            logger.error('EmbeddingService non disponibile');
            return res.status(503).json({
                result: false,
                error: {
                    code: 'SERVICE_UNAVAILABLE',
                    message: 'Il servizio Embedding non è attualmente disponibile. Verifica la configurazione delle variabili ambiente.'
                },
                timestamp: new Date().toISOString(),
                processingTimeMs: Date.now() - requestStartTime
            });
        }

        // Esegui il processo di embedding
        const result = await service.processEmbeddings({
            limit,
            dryRun,
            userId
        });

        // Aggiungi timestamp alla risposta
        result.timestamp = new Date().toISOString();

        // Restituisci la risposta con lo status code appropriato
        const statusCode = result.result ? 200 : (result.error ? 400 : 500);
        res.status(statusCode).json(result);

    } catch (error) {
        logger.error(`Errore /v1/embeddings: ${error.message}`);

        res.status(500).json({
            result: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Si è verificato un errore interno. Riprova più tardi.'
            },
            timestamp: new Date().toISOString(),
            processingTimeMs: Date.now() - requestStartTime
        });
    }
});

// ============================================
// ENDPOINT: GET /v1/health
// ============================================

/**
 * Endpoint Health Check versione 1
 *
 * Route: GET /v1/health
 * Descrizione: Endpoint per monitoraggio uptime e stato del servizio
 */
router.get('/health', (req, res) => {
    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);

    const memoriaUsata = process.memoryUsage();

    // Verifica stato servizio Ask
    let askServiceStatus = 'unknown';
    let askServiceStats = null;
    try {
        const service = getAskServiceSafe();
        if (service) {
            askServiceStatus = 'healthy';
            askServiceStats = service.getStats();
        } else {
            askServiceStatus = 'unavailable';
        }
    } catch (error) {
        askServiceStatus = 'error';
    }

    // Verifica stato servizio Embedding
    let embeddingServiceStatus = 'unknown';
    let embeddingServiceConfig = null;
    try {
        const service = getEmbeddingServiceSafe();
        if (service) {
            embeddingServiceStatus = 'healthy';
            embeddingServiceConfig = service.getConfig();
        } else {
            embeddingServiceStatus = 'unavailable';
        }
    } catch (error) {
        embeddingServiceStatus = 'error';
    }

    const healthInfo = {
        status: 'healthy',
        versione: '1.3.0',
        ambiente: process.env.NODE_ENV || 'development',

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

        statistiche: {
            richiesteProcessate,
            richiesteAsk,
            richiesteEmbeddings
        },

        servizi: {
            askService: {
                status: askServiceStatus,
                stats: askServiceStats
            },
            embeddingService: {
                status: embeddingServiceStatus,
                config: embeddingServiceConfig
            }
        },

        memoria: {
            heapUsato: Math.round(memoriaUsata.heapUsed / 1024 / 1024 * 100) / 100,
            heapTotale: Math.round(memoriaUsata.heapTotal / 1024 / 1024 * 100) / 100,
            rss: Math.round(memoriaUsata.rss / 1024 / 1024 * 100) / 100,
            unita: 'MB'
        },

        sistema: {
            nodeVersion: process.version,
            piattaforma: process.platform,
            architettura: process.arch
        },

        timestamp: new Date().toISOString()
    };

    logger.info(`Health check eseguito - Status: ${healthInfo.status}`);
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
        versioneCompleta: '1.3.0',
        descrizione: 'API per Voicenotes con AI - Ricerca semantica, assistente Gemini e embedding vettoriali',
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
            ask: {
                path: '/v1/ask',
                metodo: 'POST',
                descrizione: 'Assistente AI - Fa domande alle note vocali',
                body: {
                    userId: 'UUID v4 dell\'utente (obbligatorio)',
                    query: 'Domanda da fare alle note (obbligatorio, max 2000 caratteri)',
                    threshold: 'Soglia similarità 0.0-1.0 (opzionale, default 0.7)',
                    count: 'Numero max note 1-20 (opzionale, default 5)',
                    temperature: 'Creatività risposta 0.0-1.0 (opzionale, default 0.7)',
                    maxTokens: 'Lunghezza max risposta 100-4096 (opzionale, default 2048)'
                }
            },
            embeddings: {
                path: '/v1/embeddings',
                metodo: 'POST',
                descrizione: 'Genera embedding vettoriali per le note vocali',
                body: {
                    limit: 'Numero max note da processare 1-50 (opzionale, default 3)',
                    dryRun: 'Se true, simula senza scrivere sul DB (opzionale, default false)',
                    userId: 'UUID v4 per filtrare per utente (opzionale)'
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

module.exports = router;
