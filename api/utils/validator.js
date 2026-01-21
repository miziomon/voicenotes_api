/**
 * ==============================================
 * Modulo Validator - Validazione Input
 * ==============================================
 *
 * Questo modulo fornisce schemi di validazione
 * e middleware per validare i dati in ingresso
 * utilizzando la libreria Joi.
 *
 * Caratteristiche:
 * - Schemi di validazione riutilizzabili
 * - Middleware per validazione automatica
 * - Messaggi di errore personalizzati in italiano
 * - Sanitizzazione automatica delle stringhe
 *
 * @author Voicenotes API Team
 * @version 1.1.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

// Importiamo Joi per la validazione dei dati
const Joi = require('joi');

// Importiamo il logger per registrare errori di validazione
const { logger } = require('./logger');

// ============================================
// CONFIGURAZIONE MESSAGGI DI ERRORE ITALIANO
// ============================================

// Definiamo messaggi di errore personalizzati in italiano
// Questi verranno usati al posto dei messaggi predefiniti in inglese
const messaggiErrore = {
    'string.base': '{{#label}} deve essere una stringa di testo',
    'string.empty': '{{#label}} non può essere vuoto',
    'string.min': '{{#label}} deve avere almeno {{#limit}} caratteri',
    'string.max': '{{#label}} non può superare {{#limit}} caratteri',
    'string.email': '{{#label}} deve essere un indirizzo email valido',
    'string.pattern.base': '{{#label}} ha un formato non valido',
    'string.alphanum': '{{#label}} può contenere solo lettere e numeri',
    'string.uri': '{{#label}} deve essere un URL valido',
    'number.base': '{{#label}} deve essere un numero',
    'number.min': '{{#label}} deve essere almeno {{#limit}}',
    'number.max': '{{#label}} non può superare {{#limit}}',
    'number.integer': '{{#label}} deve essere un numero intero',
    'number.positive': '{{#label}} deve essere un numero positivo',
    'any.required': '{{#label}} è un campo obbligatorio',
    'any.invalid': '{{#label}} contiene un valore non valido',
    'object.unknown': 'Il campo {{#label}} non è consentito',
    'array.base': '{{#label}} deve essere un array',
    'array.min': '{{#label}} deve contenere almeno {{#limit}} elementi',
    'array.max': '{{#label}} non può contenere più di {{#limit}} elementi',
    'boolean.base': '{{#label}} deve essere vero o falso',
    'date.base': '{{#label}} deve essere una data valida',
    'date.min': '{{#label}} non può essere precedente a {{#limit}}',
    'date.max': '{{#label}} non può essere successiva a {{#limit}}'
};

// ============================================
// SCHEMI DI VALIDAZIONE
// ============================================

/**
 * Schema per la validazione di stringhe di testo generiche
 *
 * Regole:
 * - Tipo: stringa
 * - Minimo 1 carattere
 * - Massimo 500 caratteri
 * - Trim automatico degli spazi
 * - Escaping caratteri HTML pericolosi
 */
const stringSchema = Joi.string()
    .min(1)
    .max(500)
    .trim()
    .messages(messaggiErrore);

/**
 * Schema per la validazione di nomi/titoli
 *
 * Regole:
 * - Tipo: stringa
 * - Minimo 2 caratteri
 * - Massimo 100 caratteri
 * - Solo lettere, numeri, spazi e trattini
 */
const nomeSchema = Joi.string()
    .min(2)
    .max(100)
    .trim()
    .pattern(/^[a-zA-Z0-9À-ÿ\s\-_']+$/)
    .messages({
        ...messaggiErrore,
        'string.pattern.base': '{{#label}} può contenere solo lettere, numeri, spazi e trattini'
    });

/**
 * Schema per la validazione di email
 *
 * Regole:
 * - Tipo: stringa
 * - Formato email valido
 * - Lowercase automatico
 */
const emailSchema = Joi.string()
    .email({ tlds: { allow: false } })
    .lowercase()
    .trim()
    .messages(messaggiErrore);

/**
 * Schema per la validazione di URL
 *
 * Regole:
 * - Tipo: stringa
 * - Formato URI valido
 * - Protocolli permessi: http, https
 */
const urlSchema = Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .trim()
    .messages(messaggiErrore);

/**
 * Schema per la validazione di numeri interi positivi
 */
const numeroPositivoSchema = Joi.number()
    .integer()
    .positive()
    .messages(messaggiErrore);

/**
 * Schema per la validazione di ID
 *
 * Regole:
 * - Tipo: stringa alfanumerica
 * - Lunghezza tra 1 e 50 caratteri
 */
const idSchema = Joi.string()
    .alphanum()
    .min(1)
    .max(50)
    .messages(messaggiErrore);

/**
 * Schema per parametri di query dell'endpoint test
 *
 * Parametri opzionali:
 * - message: stringa di testo (max 200 caratteri)
 * - format: enum ('json', 'text')
 */
const testQuerySchema = Joi.object({
    message: Joi.string()
        .max(200)
        .trim()
        .optional()
        .messages(messaggiErrore),
    format: Joi.string()
        .valid('json', 'text')
        .optional()
        .messages({
            ...messaggiErrore,
            'any.only': '{{#label}} deve essere "json" o "text"'
        })
}).messages(messaggiErrore);

/**
 * Schema per validare dati generici in body
 */
const genericBodySchema = Joi.object({
    nome: nomeSchema.optional(),
    email: emailSchema.optional(),
    messaggio: stringSchema.optional(),
    url: urlSchema.optional()
}).messages(messaggiErrore);

// ============================================
// FUNZIONI DI UTILITÀ
// ============================================

/**
 * Sanitizza una stringa rimuovendo caratteri potenzialmente pericolosi
 *
 * @param {string} input - Stringa da sanitizzare
 * @returns {string} Stringa sanitizzata
 */
const sanitizzaStringa = (input) => {
    if (typeof input !== 'string') {
        return input;
    }

    // Rimuoviamo caratteri HTML potenzialmente pericolosi
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
};

/**
 * Sanitizza ricorsivamente un oggetto
 *
 * @param {Object} obj - Oggetto da sanitizzare
 * @returns {Object} Oggetto sanitizzato
 */
const sanitizzaOggetto = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
        return sanitizzaStringa(obj);
    }

    const risultato = {};
    for (const [chiave, valore] of Object.entries(obj)) {
        if (typeof valore === 'string') {
            risultato[chiave] = sanitizzaStringa(valore);
        } else if (typeof valore === 'object' && valore !== null) {
            risultato[chiave] = sanitizzaOggetto(valore);
        } else {
            risultato[chiave] = valore;
        }
    }
    return risultato;
};

// ============================================
// MIDDLEWARE DI VALIDAZIONE
// ============================================

/**
 * Crea un middleware di validazione per uno schema Joi specifico
 *
 * @param {Joi.Schema} schema - Schema Joi da utilizzare
 * @param {string} proprieta - Proprietà della request da validare ('body', 'query', 'params')
 * @returns {Function} Middleware Express per la validazione
 *
 * Esempio d'uso:
 * app.post('/api/test', validaInput(mySchema, 'body'), handler);
 */
const validaInput = (schema, proprieta = 'body') => {
    return (req, res, next) => {
        // Otteniamo i dati da validare dalla proprietà specificata
        const datiDaValidare = req[proprieta];

        // Eseguiamo la validazione con Joi
        const { error, value } = schema.validate(datiDaValidare, {
            // Interrompi alla prima violazione (false = valida tutto)
            abortEarly: false,

            // Rimuovi proprietà non definite nello schema
            stripUnknown: true,

            // Converti i tipi quando possibile (es. stringa -> numero)
            convert: true
        });

        // Se ci sono errori di validazione, restituiamo 400 Bad Request
        if (error) {
            // Estraiamo i dettagli degli errori
            const dettagliErrori = error.details.map(err => ({
                campo: err.path.join('.'),
                messaggio: err.message,
                tipo: err.type
            }));

            // Logghiamo l'errore di validazione
            logger.warn(`Errore validazione su ${proprieta}: ${JSON.stringify(dettagliErrori)}`);

            // Restituiamo la risposta di errore
            return res.status(400).json({
                errore: 'Dati non validi',
                messaggio: 'I dati forniti non superano la validazione',
                dettagli: dettagliErrori,
                codice: 'VALIDATION_ERROR'
            });
        }

        // Se la validazione passa, sostituiamo i dati con quelli validati/sanitizzati
        req[proprieta] = sanitizzaOggetto(value);

        // Passiamo al prossimo middleware
        next();
    };
};

/**
 * Middleware per sanitizzare automaticamente body, query e params
 *
 * Questo middleware sanitizza tutti i dati in ingresso
 * senza richiedere uno schema specifico.
 */
const sanitizzaInput = (req, res, next) => {
    // Sanitizziamo il body se presente
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizzaOggetto(req.body);
    }

    // Sanitizziamo i query params se presenti
    if (req.query && typeof req.query === 'object') {
        req.query = sanitizzaOggetto(req.query);
    }

    // Sanitizziamo i route params se presenti
    if (req.params && typeof req.params === 'object') {
        req.params = sanitizzaOggetto(req.params);
    }

    next();
};

// ============================================
// ESPORTAZIONE DEL MODULO
// ============================================

module.exports = {
    // Schemi di validazione
    schemas: {
        string: stringSchema,
        nome: nomeSchema,
        email: emailSchema,
        url: urlSchema,
        numeroPositivo: numeroPositivoSchema,
        id: idSchema,
        testQuery: testQuerySchema,
        genericBody: genericBodySchema
    },

    // Middleware
    validaInput,
    sanitizzaInput,

    // Funzioni di utilità
    sanitizzaStringa,
    sanitizzaOggetto,

    // Istanza Joi per creare schemi personalizzati
    Joi,

    // Messaggi di errore per estensioni
    messaggiErrore
};
