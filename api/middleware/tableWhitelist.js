/**
 * ==============================================
 * Middleware - Validazione Tabelle (Whitelist/Blacklist)
 * ==============================================
 *
 * Questo middleware verifica che le richieste al proxy Supabase
 * accedano solo a tabelle autorizzate.
 *
 * Logica di funzionamento:
 * 1. Se WHITELIST è vuota → tutte le tabelle sono permesse
 * 2. Se WHITELIST ha valori → solo quelle tabelle sono permesse
 * 3. Se una tabella è in BLACKLIST → viene sempre bloccata
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

// Parsing delle liste (da stringa CSV a array)
const parseList = (envVar) => {
    if (!envVar || envVar.trim() === '') {
        return [];
    }
    return envVar.split(',').map(item => item.trim().toLowerCase()).filter(item => item !== '');
};

// Whitelist: se vuota, tutte le tabelle sono permesse
const WHITELIST = parseList(process.env.PROXY_TABLES_WHITELIST);

// Blacklist: tabelle sempre bloccate
const BLACKLIST = parseList(process.env.PROXY_TABLES_BLACKLIST);

// Log della configurazione al caricamento del modulo
logger.info(`[TableWhitelist] Configurazione caricata:`);
logger.info(`[TableWhitelist] - Whitelist: ${WHITELIST.length > 0 ? WHITELIST.join(', ') : 'TUTTE LE TABELLE PERMESSE'}`);
logger.info(`[TableWhitelist] - Blacklist: ${BLACKLIST.length > 0 ? BLACKLIST.join(', ') : 'NESSUNA TABELLA BLOCCATA'}`);

// ============================================
// FUNZIONE DI ESTRAZIONE NOME TABELLA
// ============================================

/**
 * Estrae il nome della tabella dalla richiesta Supabase
 *
 * Analizza l'URL path per identificare la tabella target.
 * Supabase REST API usa il formato: /rest/v1/{table_name}
 *
 * @param {string} path - Il path della richiesta (es: /rest/v1/notes)
 * @returns {string|null} - Nome della tabella o null se non trovato
 */
const extractTableName = (path) => {
    // Rimuoviamo eventuali query parameters
    const cleanPath = path.split('?')[0];

    // Pattern per URL Supabase REST API: /rest/v1/{table}
    const match = cleanPath.match(/\/rest\/v1\/([^\/]+)/);

    if (match && match[1]) {
        return match[1].toLowerCase();
    }

    // Se non troviamo il pattern standard, proviamo a estrarre dal body (per RPC calls)
    return null;
};

// ============================================
// FUNZIONE DI VALIDAZIONE TABELLA
// ============================================

/**
 * Verifica se una tabella è accessibile secondo le regole whitelist/blacklist
 *
 * Logica:
 * 1. Se la tabella è in BLACKLIST → BLOCCA
 * 2. Se WHITELIST è vuota → PERMETTI (tutte le tabelle sono OK)
 * 3. Se WHITELIST ha valori e la tabella è nella lista → PERMETTI
 * 4. Altrimenti → BLOCCA
 *
 * @param {string} tableName - Nome della tabella da verificare
 * @returns {Object} - { allowed: boolean, reason: string }
 */
const isTableAllowed = (tableName) => {
    // CONTROLLO 1: Se whitelist è vuota, tutte le tabelle (anche non identificate) sono OK
    // Questo permette al proxy di funzionare anche senza identificazione tabella
    if (WHITELIST.length === 0 && BLACKLIST.length === 0) {
        return {
            allowed: true,
            reason: 'Whitelist e Blacklist vuote - tutte le richieste sono permesse'
        };
    }

    // CONTROLLO 2: Se non riusciamo a identificare la tabella
    // ma c'è una whitelist o blacklist configurata, blocchiamo per sicurezza
    if (!tableName) {
        // Se c'è solo blacklist (whitelist vuota), permettiamo
        if (WHITELIST.length === 0 && BLACKLIST.length > 0) {
            return {
                allowed: true,
                reason: 'Whitelist vuota e tabella non identificata - permessa (solo blacklist attiva)'
            };
        }

        // Se c'è whitelist configurata, blocchiamo se non identifichiamo la tabella
        return {
            allowed: false,
            reason: 'Nome della tabella non identificato nella richiesta e whitelist configurata'
        };
    }

    const tableNameLower = tableName.toLowerCase();

    // CONTROLLO 3: Blacklist ha priorità assoluta
    if (BLACKLIST.length > 0 && BLACKLIST.includes(tableNameLower)) {
        return {
            allowed: false,
            reason: `La tabella '${tableName}' è nella blacklist e non può essere accessibile`
        };
    }

    // CONTROLLO 4: Se whitelist è vuota, tutte le tabelle (non in blacklist) sono OK
    if (WHITELIST.length === 0) {
        return {
            allowed: true,
            reason: 'Whitelist vuota - tutte le tabelle sono permesse'
        };
    }

    // CONTROLLO 5: Se whitelist ha valori, la tabella deve essere nella lista
    if (WHITELIST.includes(tableNameLower)) {
        return {
            allowed: true,
            reason: `La tabella '${tableName}' è nella whitelist`
        };
    }

    // CONTROLLO 6: Tabella non in whitelist → blocca
    return {
        allowed: false,
        reason: `La tabella '${tableName}' non è nella whitelist delle tabelle autorizzate`
    };
};

// ============================================
// MIDDLEWARE EXPRESS
// ============================================

/**
 * Middleware Express per la validazione delle tabelle
 *
 * Questo middleware:
 * 1. Estrae il nome della tabella dalla richiesta
 * 2. Verifica se la tabella è autorizzata
 * 3. Blocca la richiesta con 403 se non autorizzata
 * 4. Passa al middleware successivo se autorizzata
 *
 * @param {Object} req - Request object di Express
 * @param {Object} res - Response object di Express
 * @param {Function} next - Callback per il prossimo middleware
 */
const validateTableAccess = (req, res, next) => {
    // Estraiamo il nome della tabella dal path della richiesta
    const tableName = extractTableName(req.body?.path || req.path);

    // Se non riusciamo a identificare la tabella, proviamo a cercarlo nel body
    // (utile per chiamate RPC o query complesse)
    const tableFromBody = req.body?.table || req.body?.tableName;
    const finalTableName = tableName || tableFromBody;

    // Log della richiesta in arrivo
    logger.debug(`[TableWhitelist] Verifica accesso tabella: ${finalTableName || 'NON IDENTIFICATA'}`);

    // Verifichiamo se la tabella è autorizzata
    const validation = isTableAllowed(finalTableName);

    if (!validation.allowed) {
        // ACCESSO NEGATO - Logghiamo l'evento di sicurezza
        logger.warn(`[TableWhitelist] ACCESSO NEGATO - Tabella: ${finalTableName}, IP: ${req.ip}, Motivo: ${validation.reason}`);

        // Restituiamo errore 403 Forbidden
        return res.status(403).json({
            errore: 'Accesso Negato',
            messaggio: 'Non hai i permessi per accedere a questa risorsa',
            dettagli: validation.reason,
            tabella: finalTableName,
            codice: 'TABLE_ACCESS_DENIED',
            timestamp: new Date().toISOString()
        });
    }

    // ACCESSO CONSENTITO - Logghiamo e procediamo
    logger.debug(`[TableWhitelist] ACCESSO CONSENTITO - Tabella: ${finalTableName}, Motivo: ${validation.reason}`);

    // Aggiungiamo il nome della tabella validato alla richiesta per uso successivo
    req.validatedTable = finalTableName;

    // Passiamo al prossimo middleware
    next();
};

// ============================================
// ESPORTAZIONE DEL MODULO
// ============================================

module.exports = {
    validateTableAccess,
    isTableAllowed,
    extractTableName,
    WHITELIST,
    BLACKLIST
};
