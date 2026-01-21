/**
 * ==============================================
 * Routes API Versione 2 - Supabase Proxy
 * ==============================================
 *
 * Questo file contiene le route per la versione 2 dell'API.
 * Attualmente include solo il Supabase Proxy, ma può essere
 * esteso con nuovi endpoint in futuro.
 *
 * Endpoint disponibili:
 * - ALL /v2/supabase-proxy    (RPC mode)
 * - ALL /v2/supabase-proxy/*  (Gateway mode)
 *
 * @author Voicenotes API Team
 * @version 2.0.0
 * @date 21 Gennaio 2026
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

const express = require('express');
const router = express.Router();

// Logger principale
const { logger } = require('../utils/logger');

// Rate limiter (condiviso con V1)
const { proxyLimiter } = require('../utils/rateLimiter');

// Validazione input (condivisa con V1)
const { validaInput, Joi } = require('../utils/validator');

// Middleware di sicurezza (condivisi con V1)
const { protectFromDangerousMethods } = require('../middleware/methodProtection');
const { validateTableAccess } = require('../middleware/tableWhitelist');

// Servizio Proxy V2
const { forwardToSupabaseV2 } = require('../services/supabaseProxyV2');

// ============================================
// SCHEMA VALIDAZIONE PROXY (per RPC mode)
// ============================================

/**
 * Schema di validazione per le richieste al proxy in modalità RPC
 */
const supabaseProxySchemaV2 = Joi.object({
    method: Joi.string()
        .valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD')
        .default('GET')
        .messages({
            'any.only': 'Il metodo HTTP deve essere uno tra: GET, POST, PUT, PATCH, DELETE, HEAD'
        }),
    path: Joi.string()
        .max(500)
        .default('/rest/v1/')
        .messages({
            'string.max': 'Il path non può superare 500 caratteri'
        }),
    headers: Joi.object()
        .default({}),
    body: Joi.any()
        .default(null),
    query: Joi.object()
        .default({})
}).messages({
    'object.unknown': 'Campo non riconosciuto: {{#label}}'
});

// ============================================
// CONTATORI E STATISTICHE
// ============================================

let richiesteProxyV2 = 0;
const startTimeV2 = Date.now();

// ============================================
// ENDPOINT: /v2/supabase-proxy (Gateway & RPC)
// ============================================

/**
 * Endpoint Proxy Trasparente per Supabase V2
 *
 * Route: ALL /v2/supabase-proxy*
 *
 * Supporta due modalità:
 * 1. Gateway Mode (Default per client Supabase):
 *    GET /v2/supabase-proxy/rest/v1/notes?select=*
 *    -> Inoltrata direttamente a Supabase
 *
 * 2. RPC Mode (Legacy):
 *    POST /v2/supabase-proxy con body JSON { method, path, query }
 *    -> Parsata e inoltrata
 */
router.all(
    // RegExp per catturare /supabase-proxy e tutti i suoi sottopercorsi
    /^\/supabase-proxy(\/.*)?$/,
    proxyLimiter,
    // Validazione condizionale
    (req, res, next) => {
        // req.path sarà ad es. /supabase-proxy/rest/v1/notes
        const pathSuffix = req.path.replace('/supabase-proxy', '');

        if (pathSuffix.length > 1) { // > 1 per gestire eventuale slash finale
            return next();
        }

        // Altrimenti RPC mode -> Validiamo body
        return validaInput(supabaseProxySchemaV2, 'body')(req, res, next);
    },
    protectFromDangerousMethods,
    validateTableAccess,
    async (req, res) => {
        richiesteProxyV2++;
        const requestStartTime = Date.now();

        // Determiniamo se Gateway o RPC per loggare correttamente
        const isGatewayMode = req.path.replace('/supabase-proxy', '').length > 1;
        let method, path;

        if (isGatewayMode) {
            method = req.method;
            path = req.path;
        } else {
            ({ method, path } = req.body);
        }

        logger.info(`➡️  [V2] Richiesta Proxy (${isGatewayMode ? 'Gateway' : 'RPC'}): ${method} ${path} - IP: ${req.ip}`);

        try {
            // Inoltra la richiesta a Supabase tramite il servizio proxy V2
            const result = await forwardToSupabaseV2(req);

            const processingTime = Date.now() - requestStartTime;

            // Log del risultato
            if (result.success) {
                logger.info(`✅ [V2] Proxy OK - Status: ${result.statusCode}, Durata: ${processingTime}ms`);
            } else {
                logger.warn(`⚠️  [V2] Proxy Errore - Status: ${result.statusCode}, Durata: ${processingTime}ms`);
            }

            // Impostiamo gli header rilevanti dalla risposta Supabase
            if (result.headers && typeof result.headers === 'object') {
                Object.keys(result.headers).forEach(key => {
                    res.setHeader(key, result.headers[key]);
                });
            }

            // Se la risposta è JSON, la inoltriamo come JSON
            if (result.headers && result.headers['content-type'] && result.headers['content-type'].includes('application/json')) {
                // Se siamo in Gateway mode, restituiamo direttamente i dati (come Supabase)
                // Se in RPC mode, incapsuliamo
                if (isGatewayMode) {
                    return res.status(result.statusCode).json(result.data);
                } else {
                    return res.status(result.statusCode).json({
                        success: result.success,
                        statusCode: result.statusCode,
                        data: result.data,
                        headers: result.headers,
                        duration: result.duration,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Risposta NON JSON (blob, text, etc)
            // Inviamo direttamente il dato raw
            res.status(result.statusCode).send(result.data);

        } catch (error) {
            const processingTime = Date.now() - requestStartTime;

            logger.error(`❌ [V2] Errore Proxy: ${error.message}`);
            logger.error(`Stack trace: ${error.stack}`);

            res.status(500).json({
                error: 'Internal Proxy Error',
                message: error.message,
                code: 'PROXY_INTERNAL_ERROR'
            });
        }
    }
);

// ============================================
// ENDPOINT: GET /v2/info
// ============================================

/**
 * Informazioni sulla versione 2 dell'API
 */
router.get('/info', (req, res) => {
    res.json({
        versione: '2.0.0',
        nome: 'Voicenotes API V2',
        descrizione: 'API Supabase Proxy - Versione 2',
        endpoints: {
            proxy: 'ALL /v2/supabase-proxy/*'
        },
        statistiche: {
            richiesteProxy: richiesteProxyV2,
            uptimeMs: Date.now() - startTimeV2
        },
        timestamp: new Date().toISOString()
    });
});

// ============================================
// ENDPOINT: GET /v2/health
// ============================================

/**
 * Health check per V2
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        versione: '2.0.0',
        uptime: Date.now() - startTimeV2,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// ESPORTAZIONE DEL ROUTER
// ============================================

module.exports = router;
