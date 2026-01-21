/**
 * ==============================================
 * Servizio Supabase Proxy - Transparent Forwarding
 * ==============================================
 *
 * Questo servizio agisce come proxy trasparente tra l'app React
 * e Supabase, inoltrando le richieste mantenendo la compatibilità
 * totale con @supabase/supabase-js.
 *
 * Funzionalità:
 * - Forwarding trasparente delle richieste HTTP
 * - Aggiunta automatica degli header di autenticazione con SERVICE_ROLE_KEY
 * - Preservazione di query parameters, headers e body
 * - Logging dettagliato per debugging
 *
 * @author Voicenotes API Team
 * @version 1.4.0
 * @date 21 Gennaio 2026
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

const { logger } = require('../utils/logger');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// ============================================
// CARICAMENTO VARIABILI D'AMBIENTE
// ============================================

require('dotenv').config();

// Verifica che le variabili d'ambiente necessarie siano presenti
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const errorMsg = 'ERRORE: Variabili d\'ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono obbligatorie per il proxy';
    logger.error(errorMsg);
    throw new Error(errorMsg);
}

logger.info(`[SupabaseProxy] Proxy configurato per: ${SUPABASE_URL}`);

// ============================================
// CONFIGURAZIONE LOGGER DEDICATO PER IL PROXY
// ============================================

// Verifichiamo se siamo in ambiente Vercel (il logger principale già fa questo check)
const { isVercel, isProduction } = require('../utils/logger');

// Creiamo un logger dedicato per il proxy solo in ambiente locale
let proxyLogger = logger; // Default: usa il logger principale

if (!isVercel && !isProduction) {
    try {
        // Directory dei log
        const logsDirectory = path.join(__dirname, '..', '..', 'logs');

        // Verifica/crea directory logs
        if (!fs.existsSync(logsDirectory)) {
            fs.mkdirSync(logsDirectory, { recursive: true });
        }

        // Importa il plugin per la rotazione solo in locale
        const DailyRotateFile = require('winston-daily-rotate-file');

        // Creiamo un logger dedicato per il proxy con un file separato
        proxyLogger = winston.createLogger({
            level: 'debug',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'DD-MM-YYYY HH:mm:ss'
                }),
                winston.format.printf(({ timestamp, level, message, ...metadata }) => {
                    let logMessage = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
                    if (Object.keys(metadata).length > 0) {
                        logMessage += ` | ${JSON.stringify(metadata)}`;
                    }
                    return logMessage;
                })
            ),
            transports: [
                // File dedicato per il proxy
                new DailyRotateFile({
                    filename: path.join(logsDirectory, 'supabase-proxy-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    zippedArchive: true,
                    maxSize: '20m',
                    maxFiles: '30d',
                    level: 'debug'
                }),
                // Console per debug locale
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.printf(({ level, message }) => {
                            return `${level}: [PROXY] ${message}`;
                        })
                    )
                })
            ]
        });

        logger.info('[SupabaseProxy] Logger dedicato per proxy creato con successo');
    } catch (error) {
        logger.warn(`[SupabaseProxy] Impossibile creare logger dedicato: ${error.message}. Verrà usato il logger principale.`);
    }
}

// ============================================
// FUNZIONE DI FORWARDING TRASPARENTE
// ============================================

/**
 * Inoltra una richiesta a Supabase mantenendo trasparenza totale
 *
 * Questa funzione:
 * 1. Riceve una richiesta HTTP dall'app React
 * 2. Costruisce una richiesta equivalente verso Supabase
 * 3. Aggiunge gli header di autenticazione con SERVICE_ROLE_KEY
 * 4. Inoltra la richiesta a Supabase
 * 5. Restituisce la risposta esattamente come ricevuta da Supabase
 *
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} - { success: boolean, statusCode: number, data: any, headers: Object }
 */
const forwardToSupabase = async (req) => {
    const startTime = Date.now();

    try {
        // ============================================
        // STEP 1: ESTRAZIONE INFORMAZIONI DALLA RICHIESTA
        // ============================================

        let method, targetPath, headers, body, query;

        // Rileviamo se siamo in modalità "Gateway REST" (URL diretto) o "JSON RPC" (payload)
        const isGatewayMode = req.path.includes('/rest/v1') || req.path.includes('/auth/v1') || req.path.includes('/storage/v1');

        if (isGatewayMode) {
            // MODALITÀ GATEWAY: Parametri dalla richiesta HTTP reale
            method = req.method;

            // Rimuoviamo il prefisso /supabase-proxy dal path (siamo già dentro /v1)
            // Esempio req.url: /supabase-proxy/rest/v1/notes... -> /rest/v1/notes...
            targetPath = req.url.replace(/^\/?supabase-proxy/, '') || '/rest/v1/';

            // Se targetPath inizia con // puliamolo
            if (targetPath.startsWith('//')) targetPath = targetPath.substring(1);

            headers = req.headers;
            body = req.body;
            query = req.query;

            proxyLogger.info(`🔄 Modalità Gateway rilevata: ${method} ${targetPath}`);
        } else {
            // MODALITÀ JSON RPC (Legacy/Custom): Parametri dal body JSON
            ({
                method = 'GET',
                path: targetPath = '/rest/v1/',
                headers = {},
                body = null,
                query = {}
            } = req.body || {});
        }

        // Costruiamo l'URL completo con query parameters
        // Nota: in Gateway Mode query params sono già nel query object di Express o nell'URL
        const url = new URL(targetPath, SUPABASE_URL);

        // Se siamo in modalità Gateway, i query params potrebbero non essere stati parsati se nell'URL
        if (!isGatewayMode && query && typeof query === 'object') {
            Object.keys(query).forEach(key => {
                url.searchParams.append(key, query[key]);
            });
        }
        // In gateway mode, se ci sono query params passati da Express
        if (isGatewayMode && req.query && Object.keys(req.query).length > 0) {
            // Express parsifica già i query params, li riaggiungiamo all'URL Supabase
            Object.keys(req.query).forEach(key => {
                // Evitiamo duplicati se già presenti nel path
                if (!url.searchParams.has(key)) {
                    url.searchParams.append(key, req.query[key]);
                }
            });
        }

        // Log della richiesta in arrivo
        proxyLogger.info(`➡️  Forwarding ${method} ${targetPath} → Supabase`);
        proxyLogger.debug(`URL completo: ${url.toString()}`);

        // ============================================
        // STEP 2: COSTRUZIONE HEADERS PER SUPABASE
        // ============================================

        const supabaseHeaders = {
            // CRITICAL: Apikey header richiesto da Supabase
            'apikey': SUPABASE_SERVICE_ROLE_KEY,

            // CRITICAL: Authorization header con Bearer token (SERVICE_ROLE_KEY)
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

            // Content-Type default
            'Content-Type': 'application/json',

            // Headers aggiuntivi dal client (filtrati)
            ...filterClientHeaders(headers)
        };

        proxyLogger.debug(`Headers preparati: ${JSON.stringify(Object.keys(supabaseHeaders))}`);

        // ============================================
        // STEP 3: PREPARAZIONE CONFIGURAZIONE FETCH
        // ============================================

        const fetchOptions = {
            method: method.toUpperCase(),
            headers: supabaseHeaders
        };

        // Aggiungiamo il body solo per metodi che lo supportano
        if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
            proxyLogger.debug(`Body incluso (${fetchOptions.body.length} caratteri)`);
        }

        // ============================================
        // STEP 4: ESECUZIONE RICHIESTA A SUPABASE
        // ============================================

        proxyLogger.debug(`🚀 Invio richiesta a Supabase...`);

        const response = await fetch(url.toString(), fetchOptions);

        // ============================================
        // STEP 5: LETTURA E PARSING RISPOSTA
        // ============================================

        // Leggiamo il body della risposta
        const responseText = await response.text();

        // Proviamo a parsare come JSON
        let responseData;
        try {
            responseData = responseText ? JSON.parse(responseText) : null;
        } catch (e) {
            // Se non è JSON, restituiamo il testo grezzo
            responseData = responseText;
        }

        // Estraiamo gli header rilevanti dalla risposta
        const responseHeaders = extractRelevantHeaders(response.headers);

        const duration = Date.now() - startTime;

        // ============================================
        // STEP 6: LOGGING DELLA RISPOSTA
        // ============================================

        if (response.ok) {
            proxyLogger.info(`✅ Risposta OK - Status: ${response.status}, Durata: ${duration}ms`);
        } else {
            proxyLogger.warn(`⚠️  Risposta Errore - Status: ${response.status}, Durata: ${duration}ms`);
            proxyLogger.warn(`Errore Supabase: ${JSON.stringify(responseData).substring(0, 200)}`);
        }

        // ============================================
        // STEP 7: RESTITUZIONE RISPOSTA
        // ============================================

        return {
            success: response.ok,
            statusCode: response.status,
            statusText: response.statusText,
            data: responseData,
            headers: responseHeaders,
            duration: duration
        };

    } catch (error) {
        // ============================================
        // GESTIONE ERRORI
        // ============================================

        const duration = Date.now() - startTime;

        proxyLogger.error(`❌ Errore durante forwarding a Supabase: ${error.message}`);
        proxyLogger.error(`Stack trace: ${error.stack}`);

        return {
            success: false,
            statusCode: 500,
            statusText: 'Internal Server Error',
            data: {
                error: 'PROXY_ERROR',
                message: 'Errore durante l\'inoltro della richiesta a Supabase',
                details: error.message
            },
            headers: {},
            duration: duration
        };
    }
};

// ============================================
// FUNZIONI UTILITY
// ============================================

/**
 * Filtra gli header del client mantenendo solo quelli sicuri
 *
 * Rimuove header sensibili o che potrebbero causare conflitti:
 * - Authorization (verrà sostituito con SERVICE_ROLE_KEY)
 * - apikey (verrà sostituito)
 * - Host (specifico del client)
 * - Connection
 * - etc.
 *
 * @param {Object} clientHeaders - Headers originali dal client
 * @returns {Object} - Headers filtrati e sicuri
 */
const filterClientHeaders = (clientHeaders) => {
    const filtered = {};
    const blockedHeaders = [
        'authorization',
        'apikey',
        'host',
        'connection',
        'content-length',
        'transfer-encoding'
    ];

    if (!clientHeaders || typeof clientHeaders !== 'object') {
        return filtered;
    }

    Object.keys(clientHeaders).forEach(key => {
        const keyLower = key.toLowerCase();

        // Mantieni solo gli header non bloccati
        if (!blockedHeaders.includes(keyLower)) {
            filtered[key] = clientHeaders[key];
        }
    });

    return filtered;
};

/**
 * Estrae gli header rilevanti dalla risposta di Supabase
 *
 * Mantiene header utili per il client:
 * - content-type
 * - content-range (per paginazione)
 * - preference-applied
 * - etc.
 *
 * @param {Headers} responseHeaders - Headers dalla risposta Supabase
 * @returns {Object} - Headers rilevanti da passare al client
 */
const extractRelevantHeaders = (responseHeaders) => {
    const relevant = {};
    const importantHeaders = [
        'content-type',
        'content-range',
        'preference-applied',
        'x-client-info'
    ];

    // Convertiamo Headers iterator in oggetto
    if (responseHeaders && typeof responseHeaders.forEach === 'function') {
        responseHeaders.forEach((value, key) => {
            const keyLower = key.toLowerCase();
            if (importantHeaders.includes(keyLower)) {
                relevant[key] = value;
            }
        });
    }

    return relevant;
};

// ============================================
// ESPORTAZIONE DEL MODULO
// ============================================

module.exports = {
    forwardToSupabase,
    proxyLogger,
    SUPABASE_URL,
    // Esportiamo anche le utility per testing
    filterClientHeaders,
    extractRelevantHeaders
};
