/**
 * ==============================================
 * Middleware - Protezione Metodi HTTP Pericolosi
 * ==============================================
 *
 * Questo middleware impedisce l'esecuzione di metodi HTTP
 * pericolosi per la sicurezza del database.
 *
 * Blocca operazioni come:
 * - TRUNCATE (svuota tabella)
 * - DROP (elimina tabella/database)
 * - ALTER (modifica struttura)
 * - Altri metodi personalizzabili via .env
 *
 * @author Voicenotes API Team
 * @version 1.4.0
 * @date 21 Gennaio 2026
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

const { logger } = require('../utils/logger');

// ============================================
// CARICAMENTO CONFIGURAZIONE DA VARIABILI AMBIENTE
// ============================================

// Carichiamo le variabili d'ambiente
require('dotenv').config();

// Parsing della lista dei metodi bloccati
const parseList = (envVar) => {
    if (!envVar || envVar.trim() === '') {
        return [];
    }
    return envVar.split(',').map(item => item.trim().toUpperCase()).filter(item => item !== '');
};

// Metodi bloccati configurabili via .env
const CUSTOM_BLOCKED_METHODS = parseList(process.env.PROXY_BLOCKED_METHODS);

// Metodi sempre pericolosi (hardcoded per sicurezza)
const ALWAYS_BLOCKED_METHODS = [
    'TRUNCATE',   // Svuota completamente una tabella
    'DROP',       // Elimina tabelle/database
    'ALTER',      // Modifica struttura schema
    'CREATE',     // Crea nuove tabelle/database (potenzialmente pericoloso)
    'GRANT',      // Modifica permessi
    'REVOKE'      // Rimuove permessi
];

// Uniamo i metodi sempre bloccati con quelli custom (rimuovendo duplicati)
const BLOCKED_METHODS = [...new Set([...ALWAYS_BLOCKED_METHODS, ...CUSTOM_BLOCKED_METHODS])];

// Log della configurazione al caricamento del modulo
logger.info(`[MethodProtection] Configurazione caricata:`);
logger.info(`[MethodProtection] - Metodi bloccati (default): ${ALWAYS_BLOCKED_METHODS.join(', ')}`);
if (CUSTOM_BLOCKED_METHODS.length > 0) {
    logger.info(`[MethodProtection] - Metodi bloccati (custom): ${CUSTOM_BLOCKED_METHODS.join(', ')}`);
}
logger.info(`[MethodProtection] - Totale metodi bloccati: ${BLOCKED_METHODS.length}`);

// ============================================
// FUNZIONE DI RILEVAMENTO METODI PERICOLOSI
// ============================================

/**
 * Analizza una query SQL o un metodo HTTP per rilevare operazioni pericolose
 *
 * Controlla:
 * 1. Il metodo HTTP della richiesta
 * 2. Il contenuto del body per query SQL pericolose
 * 3. I parametri della richiesta
 *
 * @param {Object} req - Request object di Express
 * @returns {Object} - { isSafe: boolean, reason: string, detectedMethod: string }
 */
const detectDangerousMethod = (req) => {
    const method = req.method.toUpperCase();
    const body = req.body || {};
    const bodyString = JSON.stringify(body).toUpperCase();

    // CONTROLLO 1: Verifica se il metodo HTTP è pericoloso
    // (anche se per REST API standard HTTP non ha questi verbi SQL)
    if (BLOCKED_METHODS.includes(method)) {
        return {
            isSafe: false,
            reason: `Il metodo HTTP '${method}' non è permesso`,
            detectedMethod: method
        };
    }

    // CONTROLLO 2: Verifica se nel body ci sono keyword SQL pericolose
    for (const blockedMethod of BLOCKED_METHODS) {
        // Cerchiamo la keyword con pattern che eviti falsi positivi
        // Es: "TRUNCATE TABLE" è pericoloso, ma "my_truncate_field" no
        const patterns = [
            new RegExp(`\\b${blockedMethod}\\s+TABLE\\b`, 'i'),
            new RegExp(`\\b${blockedMethod}\\s+DATABASE\\b`, 'i'),
            new RegExp(`\\b${blockedMethod}\\s+SCHEMA\\b`, 'i'),
            new RegExp(`\\b${blockedMethod}\\s+IF\\b`, 'i'),
            new RegExp(`^\\s*${blockedMethod}\\s`, 'i') // Keyword all'inizio
        ];

        for (const pattern of patterns) {
            if (pattern.test(bodyString)) {
                return {
                    isSafe: false,
                    reason: `Rilevato comando SQL pericoloso: ${blockedMethod}`,
                    detectedMethod: blockedMethod
                };
            }
        }
    }

    // CONTROLLO 3: Verifica campi specifici che potrebbero contenere SQL raw
    const dangerousFields = ['query', 'sql', 'rawQuery', 'command'];

    for (const field of dangerousFields) {
        if (body[field]) {
            const fieldValue = String(body[field]).toUpperCase();

            for (const blockedMethod of BLOCKED_METHODS) {
                if (fieldValue.includes(blockedMethod)) {
                    return {
                        isSafe: false,
                        reason: `Campo '${field}' contiene comando pericoloso: ${blockedMethod}`,
                        detectedMethod: blockedMethod
                    };
                }
            }
        }
    }

    // CONTROLLO 4: Verifica RPC calls pericolose
    if (body.rpc || body.function) {
        const rpcName = (body.rpc || body.function).toUpperCase();

        for (const blockedMethod of BLOCKED_METHODS) {
            if (rpcName.includes(blockedMethod)) {
                return {
                    isSafe: false,
                    reason: `RPC function pericolosa rilevata: ${rpcName}`,
                    detectedMethod: blockedMethod
                };
            }
        }
    }

    // Nessun metodo pericoloso rilevato
    return {
        isSafe: true,
        reason: 'Nessun metodo pericoloso rilevato',
        detectedMethod: null
    };
};

// ============================================
// MIDDLEWARE EXPRESS
// ============================================

/**
 * Middleware Express per la protezione da metodi pericolosi
 *
 * Questo middleware:
 * 1. Analizza la richiesta per rilevare metodi SQL pericolosi
 * 2. Blocca la richiesta con 403 se rileva operazioni pericolose
 * 3. Passa al middleware successivo se la richiesta è sicura
 *
 * @param {Object} req - Request object di Express
 * @param {Object} res - Response object di Express
 * @param {Function} next - Callback per il prossimo middleware
 */
const protectFromDangerousMethods = (req, res, next) => {
    // Analizziamo la richiesta per metodi pericolosi
    const analysis = detectDangerousMethod(req);

    if (!analysis.isSafe) {
        // METODO PERICOLOSO RILEVATO - Logghiamo l'evento di sicurezza critico
        logger.error(`[MethodProtection] ⚠️ TENTATIVO DI OPERAZIONE PERICOLOSA BLOCCATO!`);
        logger.error(`[MethodProtection] - IP: ${req.ip}`);
        logger.error(`[MethodProtection] - Metodo rilevato: ${analysis.detectedMethod}`);
        logger.error(`[MethodProtection] - Motivo: ${analysis.reason}`);
        logger.error(`[MethodProtection] - Path: ${req.path}`);
        logger.error(`[MethodProtection] - Body: ${JSON.stringify(req.body).substring(0, 200)}...`);

        // Restituiamo errore 403 Forbidden
        return res.status(403).json({
            errore: 'Operazione Non Consentita',
            messaggio: 'La richiesta contiene operazioni non permesse per motivi di sicurezza',
            dettagli: analysis.reason,
            metodoBlocco: analysis.detectedMethod,
            codice: 'DANGEROUS_METHOD_BLOCKED',
            timestamp: new Date().toISOString()
        });
    }

    // RICHIESTA SICURA - Logghiamo (solo in debug per non sovraccaricare i log)
    logger.debug(`[MethodProtection] Richiesta sicura verificata - ${req.method} ${req.path}`);

    // Passiamo al prossimo middleware
    next();
};

// ============================================
// ESPORTAZIONE DEL MODULO
// ============================================

module.exports = {
    protectFromDangerousMethods,
    detectDangerousMethod,
    BLOCKED_METHODS
};
