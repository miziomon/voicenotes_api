/**
 * ==============================================
 * Embedding Service - Generazione Embedding per Voicenotes
 * ==============================================
 *
 * Questo modulo implementa la logica per generare embedding vettoriali
 * delle note vocali, replicando il comportamento di process_embeddings.py
 *
 * Funzionalità:
 * - Recupero note con status='completed' e embedding=NULL
 * - Costruzione testo combinato (title, excerpt, categories, tags, transcription)
 * - Generazione embedding con Google Gemini (gemini-embedding-001)
 * - Batch processing per efficienza (10 testi per chiamata)
 * - Aggiornamento campo embedding su Supabase
 * - Logging dettagliato su file dedicato (embeddings.log)
 * - Retry con exponential backoff
 *
 * @author Voicenotes API Team
 * @version 1.0.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

// Client Supabase per database
const { createClient } = require('@supabase/supabase-js');

// SDK Google Generative AI per Gemini
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Validazione UUID
const { validate: uuidValidate } = require('uuid');

// Caricamento variabili ambiente
require('dotenv').config();

// Logger personalizzato
const { logger } = require('../utils/logger');

// Moduli per logging su file
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURAZIONE COSTANTI
// ============================================

// Modello Gemini per gli embedding
const EMBEDDING_MODEL = 'models/gemini-embedding-001';

// Dimensione del vettore embedding (DEVE essere 1536 per pgvector)
const EMBEDDING_DIMENSION = 1536;

// Task type per ottimizzare gli embedding per la ricerca semantica
// RETRIEVAL_DOCUMENT: per documenti da indicizzare (testi lunghi)
const TASK_TYPE = 'RETRIEVAL_DOCUMENT';

// Nome della tabella su Supabase
const TABLE_NAME = 'notes';

// Parametri di default
const DEFAULT_BATCH_LIMIT = 3;  // Note per esecuzione (default conservativo)
const GEMINI_BATCH_SIZE = 10;   // Testi per chiamata API Gemini
const MAX_TEXT_LENGTH = 8000;   // Lunghezza massima testo in caratteri
const DELAY_BETWEEN_CALLS = 200; // Delay in ms tra le chiamate API

// Configurazione retry
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000; // 2 secondi

// Configurazione timeout
const API_TIMEOUT = 30000; // 30 secondi

// ============================================
// CONFIGURAZIONE LOGGING SU FILE DEDICATO
// ============================================

// Directory e file per il log degli embedding
const LOG_DIRECTORY = path.join(__dirname, '..', '..', 'logs');
const EMBEDDING_LOG_FILE = path.join(LOG_DIRECTORY, 'embeddings.log');

/**
 * Classe per gestire il logging verboso su file dedicato
 */
class EmbeddingLogger {
    constructor() {
        this.logFile = EMBEDDING_LOG_FILE;
        this._ensureLogDirectory();
    }

    /**
     * Assicura che la directory dei log esista
     */
    _ensureLogDirectory() {
        try {
            if (!fs.existsSync(LOG_DIRECTORY)) {
                fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
            }
        } catch (error) {
            console.warn(`Impossibile creare directory logs: ${error.message}`);
        }
    }

    /**
     * Ottiene il timestamp formattato
     */
    _getTimestamp() {
        return new Date().toISOString().replace('T', ' ').substring(0, 19);
    }

    /**
     * Scrive una riga nel file di log
     */
    _writeToFile(level, message) {
        try {
            const logLine = `[${this._getTimestamp()}] [${level.padEnd(7)}] ${message}\n`;
            fs.appendFileSync(this.logFile, logLine, 'utf8');
        } catch (error) {
            // Se fallisce la scrittura su file, logga su console
            console.warn(`Errore scrittura log: ${error.message}`);
        }
    }

    /**
     * Log di inizio processo
     */
    startProcess(params) {
        const separator = '='.repeat(70);
        this._writeToFile('INFO', separator);
        this._writeToFile('INFO', 'EMBEDDING PROCESSOR - INIZIO PROCESSO');
        this._writeToFile('INFO', separator);
        this._writeToFile('INFO', `Parametri: limit=${params.limit}, dryRun=${params.dryRun}, userId=${params.userId || 'tutti'}`);
        this._writeToFile('INFO', `Modello: ${EMBEDDING_MODEL}`);
        this._writeToFile('INFO', `Dimensione vettore: ${EMBEDDING_DIMENSION}`);
        this._writeToFile('INFO', `Task type: ${TASK_TYPE}`);
        this._writeToFile('INFO', `Batch size Gemini: ${GEMINI_BATCH_SIZE}`);
        this._writeToFile('INFO', separator);
    }

    /**
     * Log informativo
     */
    info(message) {
        this._writeToFile('INFO', message);
    }

    /**
     * Log di successo
     */
    success(message) {
        this._writeToFile('SUCCESS', message);
    }

    /**
     * Log di warning
     */
    warn(message) {
        this._writeToFile('WARN', message);
    }

    /**
     * Log di errore
     */
    error(message) {
        this._writeToFile('ERROR', message);
    }

    /**
     * Log di debug
     */
    debug(message) {
        this._writeToFile('DEBUG', message);
    }

    /**
     * Log del processing di una nota
     */
    processingNote(noteId, title, textLength) {
        const displayTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;
        this._writeToFile('INFO', `Nota ID ${noteId}: "${displayTitle}" (${textLength} caratteri)`);
    }

    /**
     * Log di nota saltata
     */
    skippedNote(noteId, title, reason) {
        const displayTitle = title.length > 40 ? title.substring(0, 40) + '...' : title;
        this._writeToFile('WARN', `SALTATA - ID ${noteId}: "${displayTitle}" - Motivo: ${reason}`);
    }

    /**
     * Log di errore per una nota
     */
    noteError(noteId, title, error) {
        const displayTitle = title.length > 40 ? title.substring(0, 40) + '...' : title;
        this._writeToFile('ERROR', `ERRORE - ID ${noteId}: "${displayTitle}" - ${error}`);
    }

    /**
     * Log di fine processo con report
     */
    endProcess(stats, duration) {
        const separator = '='.repeat(70);
        this._writeToFile('INFO', '');
        this._writeToFile('INFO', separator);
        this._writeToFile('INFO', 'REPORT FINALE');
        this._writeToFile('INFO', separator);
        this._writeToFile('INFO', `Note trovate:              ${stats.totalFound}`);
        this._writeToFile('INFO', `Note processate:           ${stats.processed}`);
        this._writeToFile('INFO', `Note con errori:           ${stats.errors}`);
        this._writeToFile('INFO', `Note saltate (vuote):      ${stats.skippedEmpty}`);
        this._writeToFile('INFO', `Note saltate (troppo lunghe): ${stats.skippedTooLong}`);
        this._writeToFile('INFO', `Chiamate API effettuate:   ${stats.apiCalls}`);
        this._writeToFile('INFO', `Tempo totale:              ${duration}ms`);
        this._writeToFile('INFO', separator);

        if (stats.processed === stats.totalFound - stats.skippedEmpty - stats.skippedTooLong) {
            this._writeToFile('SUCCESS', 'COMPLETATO: Tutte le note valide sono state processate!');
        } else if (stats.processed > 0) {
            this._writeToFile('WARN', 'PARZIALMENTE COMPLETATO: Alcune note non sono state processate.');
        } else {
            this._writeToFile('ERROR', 'NESSUNA NOTA PROCESSATA. Verificare gli errori.');
        }

        this._writeToFile('INFO', separator);
        this._writeToFile('INFO', '');
    }
}

// Istanza globale del logger per embedding
const embeddingLogger = new EmbeddingLogger();

// ============================================
// FUNZIONE SLEEP PER DELAY
// ============================================

/**
 * Attende un numero di millisecondi
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// FUNZIONE RETRY CON BACKOFF ESPONENZIALE
// ============================================

/**
 * Esegue una funzione con retry e backoff esponenziale
 */
async function retryWithBackoff(fn, maxRetries = MAX_RETRIES, initialDelay = INITIAL_RETRY_DELAY) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Non ritentare per errori di validazione o autenticazione
            if (error.status === 400 || error.status === 401 || error.status === 403) {
                throw error;
            }

            if (attempt < maxRetries) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                embeddingLogger.warn(`Tentativo ${attempt}/${maxRetries} fallito. Retry tra ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    throw lastError;
}

// ============================================
// FUNZIONE TIMEOUT WRAPPER
// ============================================

/**
 * Wrapper per aggiungere timeout a una Promise
 */
function withTimeout(promise, timeoutMs = API_TIMEOUT, operationName = 'Operazione') {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`${operationName} timeout dopo ${timeoutMs}ms`));
            }, timeoutMs);
        })
    ]);
}

// ============================================
// CLASSE PRINCIPALE: EmbeddingService
// ============================================

class EmbeddingService {
    /**
     * Inizializza il servizio Embedding
     */
    constructor() {
        // Verifica variabili ambiente
        this._validateEnvVariables();

        // Inizializza client Supabase
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_KEY
        );

        // Inizializza client Gemini
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        logger.info('EmbeddingService inizializzato correttamente');
    }

    /**
     * Verifica che le variabili ambiente siano configurate
     */
    _validateEnvVariables() {
        const required = ['SUPABASE_URL', 'SUPABASE_KEY', 'GEMINI_API_KEY'];
        const missing = required.filter(v => !process.env[v]);

        if (missing.length > 0) {
            throw new Error(`Variabili ambiente mancanti: ${missing.join(', ')}`);
        }
    }

    /**
     * Valida l'user_id come UUID valido (se fornito)
     */
    validateUserId(userId) {
        if (!userId) return true; // userId è opzionale
        if (typeof userId !== 'string') return false;
        return uuidValidate(userId);
    }

    /**
     * Costruisce il testo da inviare per generare l'embedding
     * Combina: Title | Excerpt | Category | Tags | Content (transcription)
     */
    _buildTextForEmbedding(note) {
        const parts = [];

        // Titolo
        const title = note.title || '';
        if (title.trim()) {
            parts.push(`Title: ${title.trim()}`);
        }

        // Excerpt
        const excerpt = note.excerpt || '';
        if (excerpt.trim()) {
            parts.push(`Excerpt: ${excerpt.trim()}`);
        }

        // Categorie
        const categories = note.categories || '';
        if (categories.trim()) {
            parts.push(`Category: ${categories.trim()}`);
        }

        // Tags - può essere una stringa JSON o un array
        let tags = note.tags;
        if (tags) {
            if (typeof tags === 'string') {
                try {
                    tags = JSON.parse(tags);
                } catch (e) {
                    tags = [tags];
                }
            }
            if (Array.isArray(tags) && tags.length > 0) {
                const tagsStr = tags.map(t => String(t)).join(', ');
                parts.push(`Tags: ${tagsStr}`);
            }
        }

        // Transcription - contenuto principale
        const transcription = note.transcription || '';
        if (transcription.trim()) {
            parts.push(`Content: ${transcription.trim()}`);
        }

        return parts.join(' | ');
    }

    /**
     * Genera embedding per un batch di testi usando Gemini
     * IMPORTANTE: Forza la dimensione a 1536
     */
    async _generateEmbeddingsBatch(texts) {
        embeddingLogger.debug(`Generazione batch embedding per ${texts.length} testi`);

        const result = await retryWithBackoff(async () => {
            const embeddingModel = this.genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

            return await withTimeout(
                embeddingModel.embedContent({
                    content: { parts: texts.map(text => ({ text })) },
                    taskType: TASK_TYPE,
                    outputDimensionality: EMBEDDING_DIMENSION
                }),
                API_TIMEOUT,
                'Generazione embedding batch'
            );
        });

        // Per batch, la struttura è: result.embedding è un oggetto con values per ogni testo
        // O per un singolo testo è result.embedding.values
        let embeddings;

        if (texts.length === 1) {
            // Singolo testo: result.embedding.values è l'array
            embeddings = [result.embedding.values];
        } else {
            // Multipli testi: dobbiamo fare chiamate separate (Gemini non supporta batch embedding con embedContent)
            // Quindi processiamo uno alla volta ma in sequenza rapida
            embeddings = [];
            for (const text of texts) {
                const singleResult = await retryWithBackoff(async () => {
                    const embeddingModel = this.genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
                    return await withTimeout(
                        embeddingModel.embedContent({
                            content: { parts: [{ text }] },
                            taskType: TASK_TYPE,
                            outputDimensionality: EMBEDDING_DIMENSION
                        }),
                        API_TIMEOUT,
                        'Generazione embedding singolo'
                    );
                });
                embeddings.push(singleResult.embedding.values);

                // Piccolo delay tra le chiamate per evitare rate limiting
                if (texts.indexOf(text) < texts.length - 1) {
                    await sleep(DELAY_BETWEEN_CALLS);
                }
            }
        }

        embeddingLogger.debug(`Generati ${embeddings.length} embedding`);
        return embeddings;
    }

    /**
     * Aggiorna il campo embedding di una nota su Supabase
     */
    async _updateNoteEmbedding(noteId, embedding, dryRun = false) {
        if (dryRun) {
            embeddingLogger.info(`[DRY-RUN] Simulato aggiornamento nota ${noteId}`);
            return true;
        }

        try {
            const response = await this.supabase
                .from(TABLE_NAME)
                .update({ embedding: embedding })
                .eq('id', noteId);

            if (response.error) {
                throw new Error(response.error.message);
            }

            return true;
        } catch (error) {
            embeddingLogger.error(`Errore aggiornamento nota ${noteId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Metodo principale: processa le note e genera embedding
     *
     * @param {Object} params - Parametri
     * @param {number} [params.limit=3] - Numero massimo di note da processare
     * @param {boolean} [params.dryRun=false] - Se true, simula senza scrivere
     * @param {string} [params.userId] - Opzionale: filtra per user_id
     * @returns {Promise<Object>} Risultato con statistiche
     */
    async processEmbeddings({ limit = DEFAULT_BATCH_LIMIT, dryRun = false, userId = null }) {
        const startTime = Date.now();

        // Inizializza statistiche
        const stats = {
            totalFound: 0,
            processed: 0,
            errors: 0,
            skippedEmpty: 0,
            skippedTooLong: 0,
            apiCalls: 0
        };

        // Array per tracciare note problematiche
        const skippedNotes = [];
        const errorNotes = [];

        // Log inizio processo
        embeddingLogger.startProcess({ limit, dryRun, userId });
        logger.info(`EmbeddingService.processEmbeddings - limit: ${limit}, dryRun: ${dryRun}, userId: ${userId || 'tutti'}`);

        try {
            // -----------------------------------------------------------------
            // STEP 1: Valida userId se fornito
            // -----------------------------------------------------------------
            if (userId && !this.validateUserId(userId)) {
                const errorResponse = {
                    result: false,
                    error: {
                        code: 'USER_ID_INVALID',
                        message: "L'userId fornito non è un UUID valido"
                    },
                    stats,
                    duration: Date.now() - startTime
                };
                embeddingLogger.error(`userId non valido: ${userId}`);
                return errorResponse;
            }

            // -----------------------------------------------------------------
            // STEP 2: Recupera le note da processare
            // -----------------------------------------------------------------
            embeddingLogger.info(`Recupero note con status='completed' e embedding=NULL (limit: ${limit})...`);

            let query = this.supabase
                .from(TABLE_NAME)
                .select('id, title, excerpt, categories, tags, transcription')
                .eq('status', 'completed')
                .is('embedding', null)
                .limit(limit);

            // Filtra per userId se specificato
            if (userId) {
                query = query.eq('user_id', userId);
                embeddingLogger.info(`Filtro per user_id: ${userId}`);
            }

            const { data: notes, error: fetchError } = await query;

            if (fetchError) {
                throw new Error(`Errore recupero note: ${fetchError.message}`);
            }

            stats.totalFound = notes ? notes.length : 0;
            embeddingLogger.info(`Trovate ${stats.totalFound} note da processare`);

            // Se non ci sono note, termina
            if (!notes || notes.length === 0) {
                embeddingLogger.success('Nessuna nota da processare. Tutte le note hanno già un embedding!');

                const duration = Date.now() - startTime;
                embeddingLogger.endProcess(stats, duration);

                return {
                    result: true,
                    message: 'Nessuna nota da processare',
                    stats,
                    duration
                };
            }

            // -----------------------------------------------------------------
            // STEP 3: Prepara e filtra le note
            // -----------------------------------------------------------------
            embeddingLogger.info('Preparazione e validazione note...');

            const validNotes = [];

            for (const note of notes) {
                const noteId = note.id;
                const title = note.title || 'Senza titolo';

                // Costruisce il testo combinato
                const text = this._buildTextForEmbedding(note);

                // Verifica: testo non vuoto
                if (!text.trim()) {
                    embeddingLogger.skippedNote(noteId, title, 'nessun contenuto testuale');
                    stats.skippedEmpty++;
                    skippedNotes.push({ id: noteId, title, reason: 'empty' });
                    continue;
                }

                // Verifica: testo non troppo lungo
                if (text.length > MAX_TEXT_LENGTH) {
                    embeddingLogger.skippedNote(noteId, title, `testo troppo lungo (${text.length} caratteri, max: ${MAX_TEXT_LENGTH})`);
                    stats.skippedTooLong++;
                    skippedNotes.push({ id: noteId, title, reason: 'too_long', textLength: text.length });
                    continue;
                }

                validNotes.push({ note, text });
            }

            embeddingLogger.info(`${validNotes.length} note valide pronte per l'elaborazione`);

            if (validNotes.length === 0) {
                embeddingLogger.warn('Nessuna nota valida da processare dopo i filtri.');

                const duration = Date.now() - startTime;
                embeddingLogger.endProcess(stats, duration);

                return {
                    result: true,
                    message: 'Nessuna nota valida da processare',
                    stats,
                    skippedNotes,
                    duration
                };
            }

            // -----------------------------------------------------------------
            // STEP 4: Processa le note (genera embedding e aggiorna DB)
            // -----------------------------------------------------------------
            embeddingLogger.info('Inizio generazione embedding...');

            for (let i = 0; i < validNotes.length; i++) {
                const { note, text } = validNotes[i];
                const noteId = note.id;
                const title = note.title || 'Senza titolo';

                embeddingLogger.processingNote(noteId, title, text.length);

                try {
                    // Genera embedding (singolo per semplicità e affidabilità)
                    const embeddings = await this._generateEmbeddingsBatch([text]);
                    stats.apiCalls++;

                    if (!embeddings || embeddings.length === 0) {
                        throw new Error('Nessun embedding generato');
                    }

                    const embedding = embeddings[0];

                    // Verifica dimensione vettore
                    if (embedding.length !== EMBEDDING_DIMENSION) {
                        embeddingLogger.warn(`Dimensione embedding inattesa: ${embedding.length} (atteso: ${EMBEDDING_DIMENSION})`);
                    }

                    // Aggiorna il database
                    const updateSuccess = await this._updateNoteEmbedding(noteId, embedding, dryRun);

                    if (updateSuccess) {
                        embeddingLogger.success(`Embedding aggiornato per nota ${noteId}`);
                        stats.processed++;
                    } else {
                        stats.errors++;
                        errorNotes.push({ id: noteId, title, error: 'Aggiornamento database fallito' });
                    }

                } catch (error) {
                    embeddingLogger.noteError(noteId, title, error.message);
                    stats.errors++;
                    errorNotes.push({ id: noteId, title, error: error.message });
                }

                // Delay tra le note (tranne l'ultima)
                if (i < validNotes.length - 1) {
                    await sleep(DELAY_BETWEEN_CALLS);
                }
            }

            // -----------------------------------------------------------------
            // STEP 5: Report finale
            // -----------------------------------------------------------------
            const duration = Date.now() - startTime;
            embeddingLogger.endProcess(stats, duration);

            logger.info(`EmbeddingService completato - Processate: ${stats.processed}, Errori: ${stats.errors}, Tempo: ${duration}ms`);

            return {
                result: stats.errors === 0,
                message: stats.errors === 0
                    ? `Processate ${stats.processed} note con successo`
                    : `Processate ${stats.processed} note con ${stats.errors} errori`,
                stats,
                skippedNotes: skippedNotes.length > 0 ? skippedNotes : undefined,
                errorNotes: errorNotes.length > 0 ? errorNotes : undefined,
                duration
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            embeddingLogger.error(`Errore critico: ${error.message}`);
            embeddingLogger.endProcess(stats, duration);

            logger.error(`EmbeddingService errore critico: ${error.message}`);

            return {
                result: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: error.message
                },
                stats,
                duration
            };
        }
    }

    /**
     * Restituisce le statistiche di configurazione del servizio
     */
    getConfig() {
        return {
            embeddingModel: EMBEDDING_MODEL,
            embeddingDimension: EMBEDDING_DIMENSION,
            taskType: TASK_TYPE,
            defaultLimit: DEFAULT_BATCH_LIMIT,
            geminiBatchSize: GEMINI_BATCH_SIZE,
            maxTextLength: MAX_TEXT_LENGTH,
            maxRetries: MAX_RETRIES,
            timeoutMs: API_TIMEOUT,
            delayBetweenCalls: DELAY_BETWEEN_CALLS
        };
    }
}

// ============================================
// ESPORTAZIONE SINGLETON
// ============================================

let embeddingServiceInstance = null;

/**
 * Ottiene l'istanza singleton del servizio
 */
function getEmbeddingService() {
    if (!embeddingServiceInstance) {
        try {
            embeddingServiceInstance = new EmbeddingService();
        } catch (error) {
            logger.error(`Errore inizializzazione EmbeddingService: ${error.message}`);
            throw error;
        }
    }
    return embeddingServiceInstance;
}

module.exports = {
    getEmbeddingService,
    EmbeddingService,
    // Esporta costanti per i test
    DEFAULT_BATCH_LIMIT,
    GEMINI_BATCH_SIZE,
    MAX_TEXT_LENGTH,
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSION
};
