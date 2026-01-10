/**
 * ==============================================
 * Modulo Logger - Sistema di Logging Avanzato
 * ==============================================
 *
 * Questo modulo configura Winston per il logging
 * con le seguenti caratteristiche:
 * - Rotazione giornaliera dei file di log
 * - Pulizia automatica dei log più vecchi di 30 giorni
 * - Separazione per livelli (error, combined)
 * - Formato timestamp leggibile
 *
 * @author Voicenotes API Team
 * @version 1.1.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

// Winston è la libreria principale per il logging
const winston = require('winston');

// Plugin per la rotazione giornaliera dei file di log
const DailyRotateFile = require('winston-daily-rotate-file');

// Modulo path per gestire i percorsi dei file
const path = require('path');

// Modulo fs per operazioni sul filesystem
const fs = require('fs');

// ============================================
// CONFIGURAZIONE DIRECTORY LOG
// ============================================

// Definiamo la directory dove salvare i file di log
// Utilizziamo una cartella 'logs' nella root del progetto
// __dirname è api/utils/, quindi saliamo di 2 livelli per arrivare alla root
const logsDirectory = path.join(__dirname, '..', '..', 'logs');

// Verifichiamo se la directory esiste, altrimenti la creiamo
// Questo evita errori quando il logger tenta di scrivere i file
if (!fs.existsSync(logsDirectory)) {
    fs.mkdirSync(logsDirectory, { recursive: true });
    console.log(`📁 Directory logs creata: ${logsDirectory}`);
}

// ============================================
// CONFIGURAZIONE FORMATO LOG
// ============================================

// Definiamo il formato personalizzato per i log
// Include timestamp, livello e messaggio formattati
const logFormat = winston.format.combine(
    // Aggiungiamo il timestamp in formato italiano leggibile
    winston.format.timestamp({
        format: 'DD-MM-YYYY HH:mm:ss'
    }),
    // Formattiamo l'output in modo leggibile
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        // Costruiamo la stringa di log base
        let logMessage = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;

        // Se ci sono metadati aggiuntivi, li aggiungiamo in formato JSON
        if (Object.keys(metadata).length > 0) {
            logMessage += ` | Metadata: ${JSON.stringify(metadata)}`;
        }

        return logMessage;
    })
);

// ============================================
// CONFIGURAZIONE TRASPORTI (DESTINAZIONI LOG)
// ============================================

/**
 * Trasporto per tutti i log (combined)
 *
 * Configurazione:
 * - Rotazione giornaliera con data nel nome file
 * - Pulizia automatica dopo 30 giorni
 * - Compressione dei file archiviati
 * - Dimensione massima 20MB per file
 */
const combinedTransport = new DailyRotateFile({
    // Pattern del nome file: combined-2024-01-10.log
    filename: path.join(logsDirectory, 'combined-%DATE%.log'),

    // Formato della data nel nome file
    datePattern: 'YYYY-MM-DD',

    // Comprimi i file di log archiviati per risparmiare spazio
    zippedArchive: true,

    // Dimensione massima di ogni file di log (20 MB)
    maxSize: '20m',

    // Mantieni i log per 30 giorni, poi eliminali automaticamente
    maxFiles: '30d',

    // Livello minimo di log da registrare
    level: 'info'
});

/**
 * Trasporto per solo gli errori
 *
 * Configurazione simile al combined ma solo per errori,
 * utile per monitoraggio rapido dei problemi
 */
const errorTransport = new DailyRotateFile({
    // Pattern del nome file: error-2024-01-10.log
    filename: path.join(logsDirectory, 'error-%DATE%.log'),

    // Formato della data nel nome file
    datePattern: 'YYYY-MM-DD',

    // Comprimi i file di log archiviati
    zippedArchive: true,

    // Dimensione massima di ogni file di log
    maxSize: '20m',

    // Mantieni i log per 30 giorni
    maxFiles: '30d',

    // Solo errori in questo file
    level: 'error'
});

/**
 * Trasporto per le richieste HTTP
 *
 * Log separato per tracciare tutte le richieste API
 */
const httpTransport = new DailyRotateFile({
    // Pattern del nome file: http-2024-01-10.log
    filename: path.join(logsDirectory, 'http-%DATE%.log'),

    // Formato della data nel nome file
    datePattern: 'YYYY-MM-DD',

    // Comprimi i file di log archiviati
    zippedArchive: true,

    // Dimensione massima di ogni file di log
    maxSize: '20m',

    // Mantieni i log per 30 giorni
    maxFiles: '30d',

    // Livello http per tracciare le richieste
    level: 'http'
});

// ============================================
// CREAZIONE ISTANZA LOGGER
// ============================================

// Creiamo l'istanza principale del logger con tutti i trasporti configurati
const logger = winston.createLogger({
    // Livello minimo globale: debug (registra tutto)
    level: 'debug',

    // Applichiamo il formato personalizzato definito sopra
    format: logFormat,

    // Definiamo i livelli personalizzati
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4
    },

    // Array dei trasporti (destinazioni) dei log
    transports: [
        combinedTransport,
        errorTransport,
        httpTransport
    ],

    // Gestione delle eccezioni non catturate
    exceptionHandlers: [
        new DailyRotateFile({
            filename: path.join(logsDirectory, 'exceptions-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d'
        })
    ],

    // Non terminare il processo in caso di eccezioni non gestite
    exitOnError: false
});

// ============================================
// TRASPORTO CONSOLE (SOLO IN SVILUPPO)
// ============================================

// In ambiente di sviluppo, aggiungiamo anche l'output su console
// per facilitare il debug durante lo sviluppo
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            // Coloriamo l'output in console per maggiore leggibilità
            winston.format.colorize(),
            // Usiamo lo stesso formato definito sopra
            winston.format.timestamp({
                format: 'DD-MM-YYYY HH:mm:ss'
            }),
            winston.format.printf(({ timestamp, level, message }) => {
                return `[${timestamp}] ${level}: ${message}`;
            })
        )
    }));
}

// ============================================
// EVENTI DI ROTAZIONE
// ============================================

// Logghiamo quando avviene una rotazione dei file
combinedTransport.on('rotate', (oldFilename, newFilename) => {
    logger.info(`Rotazione log completata: ${oldFilename} -> ${newFilename}`);
});

// Logghiamo quando un file viene eliminato per pulizia
combinedTransport.on('logRemoved', (removedFilename) => {
    logger.info(`File di log eliminato per pulizia (>30 giorni): ${removedFilename}`);
});

// ============================================
// MIDDLEWARE EXPRESS PER LOGGING HTTP
// ============================================

/**
 * Middleware per loggare tutte le richieste HTTP
 *
 * Registra:
 * - Metodo HTTP (GET, POST, ecc.)
 * - URL richiesto
 * - IP del client
 * - User-Agent del client
 * - Tempo di risposta
 * - Status code della risposta
 *
 * @param {Object} req - Oggetto richiesta Express
 * @param {Object} res - Oggetto risposta Express
 * @param {Function} next - Funzione per passare al prossimo middleware
 */
const httpLogger = (req, res, next) => {
    // Salviamo il timestamp di inizio richiesta
    const startTime = Date.now();

    // Intercettiamo la fine della risposta per calcolare il tempo
    res.on('finish', () => {
        // Calcoliamo il tempo di risposta in millisecondi
        const responseTime = Date.now() - startTime;

        // Costruiamo il messaggio di log
        const logMessage = [
            `${req.method} ${req.originalUrl}`,
            `Status: ${res.statusCode}`,
            `Tempo: ${responseTime}ms`,
            `IP: ${req.ip || req.connection.remoteAddress}`,
            `User-Agent: ${req.get('User-Agent') || 'N/A'}`
        ].join(' | ');

        // Determiniamo il livello di log in base allo status code
        if (res.statusCode >= 500) {
            // Errori server: logghiamo come error
            logger.error(logMessage);
        } else if (res.statusCode >= 400) {
            // Errori client: logghiamo come warning
            logger.warn(logMessage);
        } else {
            // Successo: logghiamo come http
            logger.http(logMessage);
        }
    });

    // Passiamo al prossimo middleware
    next();
};

// ============================================
// ESPORTAZIONE DEL MODULO
// ============================================

// Esportiamo il logger e il middleware per l'uso in altri file
module.exports = {
    logger,
    httpLogger,
    logsDirectory
};
