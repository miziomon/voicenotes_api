/**
 * ==============================================
 * Modulo Rate Limiter - Limitazione Richieste
 * ==============================================
 *
 * Questo modulo configura il rate limiting per proteggere
 * l'API da un numero eccessivo di richieste.
 *
 * Configurazione predefinita:
 * - 100 richieste per finestra temporale
 * - Finestra temporale di 15 minuti
 * - Messaggio di errore personalizzato in italiano
 *
 * @author Voicenotes API Team
 * @version 1.1.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

// Importiamo express-rate-limit per la gestione del rate limiting
const rateLimit = require('express-rate-limit');

// Importiamo il logger per registrare gli eventi
const { logger } = require('./logger');

// ============================================
// CONFIGURAZIONE RATE LIMITER GLOBALE
// ============================================

/**
 * Rate limiter globale per tutte le API
 *
 * Questo limiter viene applicato a tutti gli endpoint
 * per prevenire abusi e attacchi DDoS di base.
 *
 * Configurazione:
 * - windowMs: 15 minuti (900000 ms)
 * - max: 100 richieste per finestra
 * - standardHeaders: include headers RateLimit-*
 * - legacyHeaders: disabilita X-RateLimit-* (deprecati)
 */
const globalLimiter = rateLimit({
    // Finestra temporale di 15 minuti in millisecondi
    windowMs: 15 * 60 * 1000,

    // Numero massimo di richieste per finestra temporale
    max: 100,

    // Messaggio di errore quando il limite viene superato
    message: {
        errore: 'Troppe richieste',
        messaggio: 'Hai superato il limite di richieste consentite. Riprova tra qualche minuto.',
        limite: '100 richieste ogni 15 minuti',
        codice: 'RATE_LIMIT_EXCEEDED'
    },

    // Invia headers standard RateLimit-* nella risposta
    // Questi headers informano il client sul limite rimanente
    standardHeaders: true,

    // Disabilita i vecchi headers X-RateLimit-* (deprecati)
    legacyHeaders: false,

    // Status code da restituire quando il limite è superato (429 Too Many Requests)
    statusCode: 429,

    // Funzione per determinare la chiave di identificazione del client
    // Di default usa l'IP, ma può essere personalizzata
    keyGenerator: (req) => {
        // Utilizziamo l'IP del client come identificatore
        // In produzione dietro proxy, usare req.headers['x-forwarded-for']
        return req.ip || req.connection.remoteAddress || 'unknown';
    },

    // Handler personalizzato quando il limite viene superato
    handler: (req, res, next, options) => {
        // Logghiamo l'evento di rate limit superato
        logger.warn(`Rate limit superato per IP: ${req.ip} - Endpoint: ${req.originalUrl}`);

        // Restituiamo la risposta di errore
        res.status(options.statusCode).json(options.message);
    },

    // Salta il rate limiting per alcune richieste (opzionale)
    skip: (req) => {
        // Salta il rate limit per l'endpoint /health (permette al monitoraggio di funzionare sempre)
        if (req.path === '/health' || req.path === '/v1/health') {
            return true;
        }
        // Salta il rate limit in ambiente di test per permettere ai test automatici di funzionare
        if (process.env.NODE_ENV === 'test') {
            return true;
        }
        return false;
    }
});

// ============================================
// RATE LIMITER STRICT PER ENDPOINT SENSIBILI
// ============================================

/**
 * Rate limiter più restrittivo per endpoint sensibili
 *
 * Da usare per endpoint che richiedono maggiore protezione
 * come login, registrazione, reset password, ecc.
 *
 * Configurazione:
 * - windowMs: 15 minuti
 * - max: 10 richieste per finestra
 */
const strictLimiter = rateLimit({
    // Finestra temporale di 15 minuti
    windowMs: 15 * 60 * 1000,

    // Limite più basso: solo 10 richieste
    max: 10,

    // Messaggio di errore personalizzato
    message: {
        errore: 'Limite richieste superato',
        messaggio: 'Questo endpoint ha un limite di richieste più restrittivo. Riprova più tardi.',
        limite: '10 richieste ogni 15 minuti',
        codice: 'STRICT_RATE_LIMIT_EXCEEDED'
    },

    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,

    // Handler per loggare gli eventi
    handler: (req, res, next, options) => {
        logger.warn(`Rate limit STRICT superato per IP: ${req.ip} - Endpoint: ${req.originalUrl}`);
        res.status(options.statusCode).json(options.message);
    },

    // Salta il rate limit in ambiente di test
    skip: (req) => {
        return process.env.NODE_ENV === 'test';
    }
});

// ============================================
// RATE LIMITER PER API VERSIONATE
// ============================================

/**
 * Rate limiter per le API versionate (/v1/*)
 *
 * Configurazione specifica per gli endpoint versionati
 * con limiti leggermente diversi.
 */
const apiLimiter = rateLimit({
    // Finestra temporale di 1 minuto per API più dinamiche
    windowMs: 1 * 60 * 1000,

    // 30 richieste al minuto
    max: 30,

    message: {
        errore: 'Limite API superato',
        messaggio: 'Hai superato il limite di richieste API. Attendi un minuto.',
        limite: '30 richieste al minuto',
        codice: 'API_RATE_LIMIT_EXCEEDED'
    },

    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,

    handler: (req, res, next, options) => {
        logger.warn(`Rate limit API superato per IP: ${req.ip} - Endpoint: ${req.originalUrl}`);
        res.status(options.statusCode).json(options.message);
    },

    // Salta il rate limit in ambiente di test
    skip: (req) => {
        return process.env.NODE_ENV === 'test';
    }
});

// ============================================
// RATE LIMITER PER SUPABASE PROXY
// ============================================

/**
 * Rate limiter dedicato per il proxy Supabase
 *
 * Questo limiter è configurato appositamente per l'endpoint proxy
 * che inoltra le richieste a Supabase.
 *
 * Configurazione:
 * - windowMs: 1 minuto
 * - max: 50 richieste per finestra
 *
 * Il limite è più permissivo del strictLimiter ma più controllato
 * del globalLimiter, per bilanciare usabilità e sicurezza.
 */
const proxyLimiter = rateLimit({
    // Finestra temporale di 1 minuto
    windowMs: 1 * 60 * 1000,

    // 50 richieste al minuto - sufficiente per un'app single-page
    max: 50,

    message: {
        errore: 'Limite richieste proxy superato',
        messaggio: 'Hai superato il limite di richieste al proxy Supabase. Attendi un minuto.',
        limite: '50 richieste al minuto',
        codice: 'PROXY_RATE_LIMIT_EXCEEDED'
    },

    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,

    handler: (req, res, next, options) => {
        logger.warn(`Rate limit PROXY superato per IP: ${req.ip} - Endpoint: ${req.originalUrl}`);
        res.status(options.statusCode).json(options.message);
    },

    // Salta il rate limit in ambiente di test
    skip: (req) => {
        return process.env.NODE_ENV === 'test';
    }
});

// ============================================
// ESPORTAZIONE DEL MODULO
// ============================================

// Esportiamo i vari rate limiter per l'uso in altri file
module.exports = {
    globalLimiter,
    strictLimiter,
    apiLimiter,
    proxyLimiter
};
