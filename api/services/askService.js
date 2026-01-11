/**
 * ==============================================
 * Ask Service - Servizio AI per Voicenotes
 * ==============================================
 *
 * Questo modulo implementa la logica principale per:
 * - Ricerca semantica delle note tramite Supabase
 * - Generazione risposte contestualizzate con Gemini 2.5 Flash
 * - Caching degli embedding per query frequenti
 * - Retry con backoff esponenziale per errori temporanei
 *
 * @author Voicenotes API Team
 * @version 1.2.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

// Client Supabase per database e funzioni RPC
const { createClient } = require('@supabase/supabase-js');

// SDK Google Generative AI per Gemini
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Validazione UUID
const { validate: uuidValidate } = require('uuid');

// Caricamento variabili ambiente
require('dotenv').config();

// Logger personalizzato
const { logger } = require('../utils/logger');

// ============================================
// CONFIGURAZIONE COSTANTI
// ============================================

// Modello Gemini per la generazione di risposte
const CHAT_MODEL = 'gemini-2.0-flash';

// Modello Gemini per gli embedding (stesso usato in Python/search_notes)
const EMBEDDING_MODEL = 'models/gemini-embedding-001';

// Dimensione del vettore embedding (deve matchare con la funzione RPC)
const EMBEDDING_DIMENSION = 1536;

// Task type per le query di ricerca
const TASK_TYPE = 'RETRIEVAL_QUERY';

// Parametri di default
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_MATCH_THRESHOLD = 0.7;
const DEFAULT_MATCH_COUNT = 5;

// Nome della funzione RPC su Supabase
const RPC_FUNCTION_NAME = 'match_notes';

// Configurazione retry
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 secondo

// Configurazione timeout
const API_TIMEOUT = 30000; // 30 secondi

// Configurazione cache
const CACHE_TTL = 5 * 60 * 1000; // 5 minuti
const MAX_CACHE_SIZE = 100;

// ============================================
// SYSTEM PROMPT PER GEMINI
// ============================================

const SYSTEM_PROMPT = `Sei un assistente personale intelligente che aiuta l'utente a trovare informazioni nelle sue note vocali.

ISTRUZIONI:
1. Rispondi SOLO basandoti sulle note fornite come contesto
2. Se le note non contengono informazioni sufficienti, dillo chiaramente
3. Cita sempre da quale nota hai tratto l'informazione (usa il titolo)
4. Rispondi in modo conciso ma completo
5. Se la domanda non è correlata alle note, indica che non hai trovato informazioni rilevanti
6. Rispondi nella stessa lingua della domanda dell'utente

FORMATO RISPOSTA:
- Usa un linguaggio naturale e colloquiale
- Se citi una nota, usa il formato: "Secondo la nota '[titolo]'..."
- Organizza la risposta in modo chiaro se ci sono più punti`;

// ============================================
// CLASSE CACHE PER EMBEDDING
// ============================================

/**
 * Cache LRU semplice per gli embedding delle query
 * Riduce le chiamate all'API di embedding per query frequenti
 */
class EmbeddingCache {
    constructor(maxSize = MAX_CACHE_SIZE, ttl = CACHE_TTL) {
        // Mappa per memorizzare gli embedding
        this.cache = new Map();
        // Dimensione massima della cache
        this.maxSize = maxSize;
        // Time to live in millisecondi
        this.ttl = ttl;
    }

    /**
     * Genera una chiave di cache dalla query
     */
    _generateKey(query) {
        return query.toLowerCase().trim();
    }

    /**
     * Recupera un embedding dalla cache
     * @returns {Array|null} Embedding o null se non trovato/scaduto
     */
    get(query) {
        const key = this._generateKey(query);
        const cached = this.cache.get(key);

        if (!cached) {
            return null;
        }

        // Verifica se è scaduto
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        logger.debug(`Cache hit per query: "${query.substring(0, 50)}..."`);
        return cached.embedding;
    }

    /**
     * Memorizza un embedding nella cache
     */
    set(query, embedding) {
        const key = this._generateKey(query);

        // Se la cache è piena, rimuovi l'elemento più vecchio
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
            logger.debug('Cache piena, rimosso elemento più vecchio');
        }

        this.cache.set(key, {
            embedding,
            timestamp: Date.now()
        });

        logger.debug(`Embedding memorizzato in cache per query: "${query.substring(0, 50)}..."`);
    }

    /**
     * Pulisce la cache
     */
    clear() {
        this.cache.clear();
        logger.info('Cache embedding pulita');
    }

    /**
     * Restituisce statistiche della cache
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            ttlMinutes: this.ttl / 60000
        };
    }
}

// Istanza globale della cache
const embeddingCache = new EmbeddingCache();

// ============================================
// FUNZIONE RETRY CON BACKOFF ESPONENZIALE
// ============================================

/**
 * Esegue una funzione con retry e backoff esponenziale
 *
 * @param {Function} fn - Funzione async da eseguire
 * @param {number} maxRetries - Numero massimo di tentativi
 * @param {number} initialDelay - Delay iniziale in ms
 * @returns {Promise} Risultato della funzione
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
                logger.warn(`Tentativo ${attempt}/${maxRetries} fallito. Retry tra ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
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
 *
 * @param {Promise} promise - Promise da wrappare
 * @param {number} timeoutMs - Timeout in millisecondi
 * @param {string} operationName - Nome operazione per il messaggio di errore
 * @returns {Promise} Promise con timeout
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
// CLASSE PRINCIPALE: AskService
// ============================================

class AskService {
    /**
     * Inizializza il servizio Ask
     * Configura i client Supabase e Gemini
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

        // Modello per la chat
        this.chatModel = this.genAI.getGenerativeModel({
            model: CHAT_MODEL,
            systemInstruction: SYSTEM_PROMPT
        });

        // Modello per gli embedding
        this.embeddingModel = this.genAI.getGenerativeModel({
            model: EMBEDDING_MODEL
        });

        logger.info('AskService inizializzato correttamente');
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
     * Valida l'user_id come UUID valido
     *
     * @param {string} userId - ID utente da validare
     * @returns {boolean} true se valido
     */
    validateUserId(userId) {
        if (!userId || typeof userId !== 'string') {
            return false;
        }
        return uuidValidate(userId);
    }

    /**
     * Genera l'embedding per una query
     * Usa la cache se disponibile
     *
     * @param {string} query - Testo della query
     * @returns {Promise<Array<number>>} Vettore embedding
     */
    async generateQueryEmbedding(query) {
        // Controlla la cache
        const cached = embeddingCache.get(query);
        if (cached) {
            return cached;
        }

        logger.info('Generazione embedding per query...');

        const result = await retryWithBackoff(async () => {
            // Usa embedContent con la stessa configurazione dello script Python
            const embeddingModel = this.genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

            return await withTimeout(
                embeddingModel.embedContent({
                    content: { parts: [{ text: query }] },
                    taskType: TASK_TYPE,
                    outputDimensionality: EMBEDDING_DIMENSION
                }),
                API_TIMEOUT,
                'Generazione embedding'
            );
        });

        const embedding = result.embedding.values;
        logger.info(`Embedding generato (${embedding.length} dimensioni)`);

        // Memorizza in cache
        embeddingCache.set(query, embedding);

        return embedding;
    }

    /**
     * Cerca le note rilevanti usando la ricerca vettoriale
     *
     * @param {string} userId - ID utente
     * @param {Array<number>} queryEmbedding - Embedding della query
     * @param {number} threshold - Soglia di similarità
     * @param {number} count - Numero massimo di risultati
     * @returns {Promise<Array>} Note trovate
     */
    async searchRelevantNotes(userId, queryEmbedding, threshold, count) {
        logger.info(`Ricerca note rilevanti (threshold: ${threshold}, count: ${count})...`);

        const result = await retryWithBackoff(async () => {
            return await withTimeout(
                this.supabase.rpc(RPC_FUNCTION_NAME, {
                    query_embedding: queryEmbedding,
                    match_threshold: threshold,
                    match_count: count,
                    p_user_id: userId
                }),
                API_TIMEOUT,
                'Ricerca note'
            );
        });

        if (result.error) {
            throw new Error(`Errore Supabase: ${result.error.message}`);
        }

        const notes = result.data || [];
        logger.info(`Trovate ${notes.length} note rilevanti`);

        return notes;
    }

    /**
     * Costruisce il contesto testuale dalle note
     *
     * @param {Array} notes - Note trovate
     * @returns {string} Contesto formattato
     */
    buildContextFromNotes(notes) {
        if (!notes || notes.length === 0) {
            return '';
        }

        const contextParts = notes.map((note, index) => {
            const title = note.title || 'Senza titolo';
            const excerpt = note.excerpt || '';
            const transcription = note.transcription || '';
            const categories = note.categories || '';
            const similarity = note.similarity || 0;

            return `
--- NOTA ${index + 1}: "${title}" (Rilevanza: ${(similarity * 100).toFixed(1)}%) ---
${categories ? `Categorie: ${categories}` : ''}
${excerpt ? `Estratto: ${excerpt}` : ''}
${transcription ? `Contenuto: ${transcription}` : ''}
`.trim();
        });

        return contextParts.join('\n\n');
    }

    /**
     * Genera la risposta con Gemini
     *
     * @param {string} query - Domanda dell'utente
     * @param {string} context - Contesto delle note
     * @param {number} temperature - Temperatura per la generazione
     * @param {number} maxTokens - Massimo numero di token
     * @returns {Promise<string>} Risposta generata
     */
    async generateResponse(query, context, temperature, maxTokens) {
        logger.info('Generazione risposta con Gemini...');

        const fullPrompt = `Ecco le note dell'utente che potrebbero contenere informazioni rilevanti:

${context}

---

DOMANDA DELL'UTENTE: ${query}

Rispondi basandoti sulle note fornite sopra.`;

        const result = await retryWithBackoff(async () => {
            return await withTimeout(
                this.chatModel.generateContent({
                    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                    generationConfig: {
                        temperature,
                        maxOutputTokens: maxTokens
                    }
                }),
                API_TIMEOUT,
                'Generazione risposta'
            );
        });

        const response = result.response.text();
        logger.info(`Risposta generata (${response.length} caratteri)`);

        return response;
    }

    /**
     * Metodo principale: esegue una domanda alle note
     *
     * @param {Object} params - Parametri della richiesta
     * @param {string} params.userId - ID utente (UUID)
     * @param {string} params.query - Domanda da fare
     * @param {number} [params.threshold] - Soglia similarità (0.0-1.0)
     * @param {number} [params.count] - Numero max note
     * @param {number} [params.temperature] - Temperatura (0.0-1.0)
     * @param {number} [params.maxTokens] - Max token risposta
     * @returns {Promise<Object>} Risultato completo
     */
    async ask({
        userId,
        query,
        threshold = DEFAULT_MATCH_THRESHOLD,
        count = DEFAULT_MATCH_COUNT,
        temperature = DEFAULT_TEMPERATURE,
        maxTokens = DEFAULT_MAX_TOKENS
    }) {
        const startTime = Date.now();

        logger.info(`Ask - User: ${userId}, Query: "${query.substring(0, 50)}..."`);

        try {
            // -----------------------------------------------------------------
            // STEP 1: Valida user_id
            // -----------------------------------------------------------------
            if (!this.validateUserId(userId)) {
                return this._createErrorResponse(
                    query,
                    userId,
                    'USER_ID_INVALID',
                    'L\'user_id fornito non è un UUID valido',
                    startTime
                );
            }

            // -----------------------------------------------------------------
            // STEP 2: Genera embedding della query
            // -----------------------------------------------------------------
            let queryEmbedding;
            try {
                queryEmbedding = await this.generateQueryEmbedding(query);
            } catch (error) {
                logger.error(`Errore embedding: ${error.message}`);
                return this._createErrorResponse(
                    query,
                    userId,
                    'EMBEDDING_ERROR',
                    'Errore nella generazione dell\'embedding della query',
                    startTime
                );
            }

            // -----------------------------------------------------------------
            // STEP 3: Cerca note rilevanti
            // -----------------------------------------------------------------
            let notes;
            try {
                notes = await this.searchRelevantNotes(userId, queryEmbedding, threshold, count);
            } catch (error) {
                logger.error(`Errore ricerca note: ${error.message}`);
                return this._createErrorResponse(
                    query,
                    userId,
                    'SEARCH_ERROR',
                    'Errore nella ricerca delle note',
                    startTime
                );
            }

            // -----------------------------------------------------------------
            // STEP 4: Verifica se ci sono note
            // -----------------------------------------------------------------
            if (notes.length === 0) {
                logger.warn('Nessuna nota trovata per la query');
                return this._createResponse(
                    query,
                    userId,
                    [],
                    null,
                    false,
                    'NO_NOTES_FOUND',
                    'Nessuna nota rilevante trovata. Prova ad abbassare la soglia di similarità o riformula la domanda.',
                    startTime,
                    { threshold, count, temperature, maxTokens }
                );
            }

            // -----------------------------------------------------------------
            // STEP 5: Costruisci contesto e genera risposta
            // -----------------------------------------------------------------
            const context = this.buildContextFromNotes(notes);

            let response;
            try {
                response = await this.generateResponse(query, context, temperature, maxTokens);
            } catch (error) {
                logger.error(`Errore generazione risposta: ${error.message}`);
                return this._createErrorResponse(
                    query,
                    userId,
                    'GENERATION_ERROR',
                    'Errore nella generazione della risposta',
                    startTime,
                    notes
                );
            }

            // -----------------------------------------------------------------
            // STEP 6: Successo!
            // -----------------------------------------------------------------
            return this._createResponse(
                query,
                userId,
                notes,
                response,
                true,
                null,
                null,
                startTime,
                { threshold, count, temperature, maxTokens }
            );

        } catch (error) {
            logger.error(`Errore imprevisto: ${error.message}`);
            return this._createErrorResponse(
                query,
                userId,
                'INTERNAL_ERROR',
                `Errore interno: ${error.message}`,
                startTime
            );
        }
    }

    /**
     * Crea la struttura di risposta standard
     */
    _createResponse(query, userId, notes, response, success, errorCode, errorMessage, startTime, params = {}) {
        const processingTime = Date.now() - startTime;

        return {
            success,
            metadata: {
                timestamp: new Date().toISOString(),
                processingTimeMs: processingTime,
                query,
                userId,
                notesFound: notes.length,
                model: CHAT_MODEL,
                embeddingModel: EMBEDDING_MODEL,
                parameters: {
                    threshold: params.threshold || DEFAULT_MATCH_THRESHOLD,
                    count: params.count || DEFAULT_MATCH_COUNT,
                    temperature: params.temperature || DEFAULT_TEMPERATURE,
                    maxTokens: params.maxTokens || DEFAULT_MAX_TOKENS
                },
                cache: embeddingCache.getStats()
            },
            data: {
                response: response,
                contextNotes: notes.map(note => ({
                    id: note.id,
                    title: note.title || 'Senza titolo',
                    excerpt: note.excerpt || null,
                    categories: note.categories || null,
                    similarity: note.similarity || 0,
                    createdAt: note.created_at || null
                }))
            },
            error: errorCode ? {
                code: errorCode,
                message: errorMessage
            } : null
        };
    }

    /**
     * Crea una risposta di errore
     */
    _createErrorResponse(query, userId, errorCode, errorMessage, startTime, notes = []) {
        return this._createResponse(
            query,
            userId,
            notes,
            null,
            false,
            errorCode,
            errorMessage,
            startTime
        );
    }

    /**
     * Restituisce le statistiche del servizio
     */
    getStats() {
        return {
            cacheStats: embeddingCache.getStats(),
            config: {
                chatModel: CHAT_MODEL,
                embeddingModel: EMBEDDING_MODEL,
                embeddingDimension: EMBEDDING_DIMENSION,
                defaultThreshold: DEFAULT_MATCH_THRESHOLD,
                defaultCount: DEFAULT_MATCH_COUNT,
                defaultTemperature: DEFAULT_TEMPERATURE,
                defaultMaxTokens: DEFAULT_MAX_TOKENS,
                maxRetries: MAX_RETRIES,
                timeoutMs: API_TIMEOUT
            }
        };
    }

    /**
     * Pulisce la cache degli embedding
     */
    clearCache() {
        embeddingCache.clear();
    }
}

// ============================================
// ESPORTAZIONE SINGLETON
// ============================================

// Creiamo una singola istanza del servizio
let askServiceInstance = null;

/**
 * Ottiene l'istanza singleton del servizio
 * @returns {AskService} Istanza del servizio
 */
function getAskService() {
    if (!askServiceInstance) {
        try {
            askServiceInstance = new AskService();
        } catch (error) {
            logger.error(`Errore inizializzazione AskService: ${error.message}`);
            throw error;
        }
    }
    return askServiceInstance;
}

module.exports = {
    getAskService,
    AskService,
    // Esporta anche le costanti per i test
    DEFAULT_TEMPERATURE,
    DEFAULT_MAX_TOKENS,
    DEFAULT_MATCH_THRESHOLD,
    DEFAULT_MATCH_COUNT,
    CHAT_MODEL,
    EMBEDDING_MODEL
};
