/**
 * ==============================================
 * Modulo Logger - Sistema di Logging Avanzato
 * ==============================================
 *
 * Questo modulo configura Winston per il logging
 * con le seguenti caratteristiche:
 * - In SVILUPPO: rotazione giornaliera dei file di log
 * - In PRODUZIONE (Vercel): solo logging su console
 * - Pulizia automatica dei log più vecchi di 30 giorni (solo locale)
 *
 * @author Voicenotes API Team
 * @version 1.1.3
 */

// Debug: verifica che il file corretto sia caricato su Vercel
console.log('[Logger] Versione 1.1.3 - Ambiente:', process.env.VERCEL ? 'Vercel' : 'Locale');

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// ============================================
// RILEVAMENTO AMBIENTE
// ============================================

// Verifichiamo se siamo in ambiente Vercel (serverless)
// Vercel imposta la variabile VERCEL=1 e il filesystem è read-only
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
const isProduction = process.env.NODE_ENV === 'production';

// ============================================
// CONFIGURAZIONE FORMATO LOG
// ============================================

const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'DD-MM-YYYY HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        let logMessage = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
            logMessage += ` | Metadata: ${JSON.stringify(metadata)}`;
        }
        return logMessage;
    })
);

// ============================================
// CONFIGURAZIONE TRASPORTI
// ============================================

// Array dei trasporti da usare
const transports = [];

// In ambiente Vercel/produzione, usiamo solo la console
// In sviluppo locale, usiamo anche i file
if (isVercel || isProduction) {
    // AMBIENTE VERCEL/PRODUZIONE: solo console
    transports.push(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'DD-MM-YYYY HH:mm:ss'
            }),
            winston.format.printf(({ timestamp, level, message }) => {
                return `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
            })
        )
    }));
} else {
    // AMBIENTE SVILUPPO LOCALE: file + console

    // Importiamo il plugin per la rotazione solo se necessario
    const DailyRotateFile = require('winston-daily-rotate-file');

    // Directory dei log
    const logsDirectory = path.join(__dirname, '..', '..', 'logs');

    // Creiamo la directory solo in ambiente locale
    try {
        if (!fs.existsSync(logsDirectory)) {
            fs.mkdirSync(logsDirectory, { recursive: true });
            console.log(`📁 Directory logs creata: ${logsDirectory}`);
        }

        // Trasporto per tutti i log (combined)
        transports.push(new DailyRotateFile({
            filename: path.join(logsDirectory, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d',
            level: 'info'
        }));

        // Trasporto per solo gli errori
        transports.push(new DailyRotateFile({
            filename: path.join(logsDirectory, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d',
            level: 'error'
        }));

        // Trasporto per le richieste HTTP
        transports.push(new DailyRotateFile({
            filename: path.join(logsDirectory, 'http-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d',
            level: 'http'
        }));
    } catch (error) {
        console.warn(`⚠️ Impossibile creare directory logs: ${error.message}`);
        console.warn('📝 Il logging su file è disabilitato, verrà usata solo la console');
    }

    // Console colorata in sviluppo
    transports.push(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
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
// CREAZIONE ISTANZA LOGGER
// ============================================

const logger = winston.createLogger({
    level: 'debug',
    format: logFormat,
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4
    },
    transports: transports,
    exitOnError: false
});

// ============================================
// MIDDLEWARE EXPRESS PER LOGGING HTTP
// ============================================

const httpLogger = (req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const responseTime = Date.now() - startTime;

        const logMessage = [
            `${req.method} ${req.originalUrl}`,
            `Status: ${res.statusCode}`,
            `Tempo: ${responseTime}ms`,
            `IP: ${req.ip || req.connection?.remoteAddress || 'unknown'}`,
            `User-Agent: ${req.get('User-Agent') || 'N/A'}`
        ].join(' | ');

        if (res.statusCode >= 500) {
            logger.error(logMessage);
        } else if (res.statusCode >= 400) {
            logger.warn(logMessage);
        } else {
            logger.http(logMessage);
        }
    });

    next();
};

// ============================================
// ESPORTAZIONE DEL MODULO
// ============================================

module.exports = {
    logger,
    httpLogger,
    isVercel,
    isProduction
};
