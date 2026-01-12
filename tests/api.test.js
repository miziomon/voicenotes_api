/**
 * ==============================================
 * Test Automatici - API Voicenotes
 * ==============================================
 *
 * Questo file contiene i test automatici per verificare
 * il corretto funzionamento di tutti gli endpoint dell'API.
 *
 * Framework utilizzato: Jest + Supertest
 *
 * Esecuzione:
 * npm test              → Esegue tutti i test con coverage
 * npm run test:watch    → Esegue i test in modalità watch
 *
 * Endpoint testati:
 * - GET  /              → Root info
 * - GET  /test          → Test legacy
 * - GET  /api/test      → Test legacy alternativo
 * - GET  /health        → Health check globale
 * - GET  /v1/test       → Test v1
 * - GET  /v1/health     → Health check v1
 * - GET  /v1/info       → Informazioni API v1
 * - POST /v1/ask        → Assistente AI
 * - POST /v1/embeddings → Generazione embedding
 *
 * @author Voicenotes API Team
 * @version 1.3.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

// Supertest permette di testare le richieste HTTP
const request = require('supertest');

// Importiamo l'app Express da testare
const app = require('../api/index');

// ============================================
// GRUPPO TEST: ENDPOINT ROOT
// ============================================

describe('Endpoint Root (/)', () => {
    /**
     * Test: La root deve restituire 200 OK
     */
    test('GET / deve restituire status 200', async () => {
        const response = await request(app)
            .get('/')
            .expect('Content-Type', /json/)
            .expect(200);

        // Verifichiamo che la risposta contenga i campi attesi
        expect(response.body).toHaveProperty('messaggio');
        expect(response.body).toHaveProperty('versione');
        expect(response.body).toHaveProperty('versioniAPI');
        expect(response.body).toHaveProperty('timestamp');
    });

    /**
     * Test: La root deve contenere il messaggio di benvenuto
     */
    test('GET / deve contenere messaggio di benvenuto', async () => {
        const response = await request(app).get('/');

        expect(response.body.messaggio).toBe('Benvenuto nelle API Voicenotes');
        expect(response.body.versione).toBe('1.1.0');
    });
});

// ============================================
// GRUPPO TEST: ENDPOINT TEST LEGACY
// ============================================

describe('Endpoint Test Legacy (/test)', () => {
    /**
     * Test: L'endpoint /test deve restituire result: true
     */
    test('GET /test deve restituire { result: true }', async () => {
        const response = await request(app)
            .get('/test')
            .expect('Content-Type', /json/)
            .expect(200);

        expect(response.body).toHaveProperty('result', true);
    });

    /**
     * Test: L'endpoint /api/test deve funzionare (legacy)
     */
    test('GET /api/test deve restituire { result: true }', async () => {
        const response = await request(app)
            .get('/api/test')
            .expect('Content-Type', /json/)
            .expect(200);

        expect(response.body).toHaveProperty('result', true);
    });
});

// ============================================
// GRUPPO TEST: ENDPOINT HEALTH GLOBALE
// ============================================

describe('Endpoint Health Globale (/health)', () => {
    /**
     * Test: L'endpoint /health deve restituire status healthy
     */
    test('GET /health deve restituire status healthy', async () => {
        const response = await request(app)
            .get('/health')
            .expect('Content-Type', /json/)
            .expect(200);

        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('versione');
        expect(response.body).toHaveProperty('uptime');
        expect(response.body).toHaveProperty('timestamp');
    });

    /**
     * Test: L'uptime deve essere un numero valido
     */
    test('GET /health uptime deve essere >= 0', async () => {
        const response = await request(app).get('/health');

        expect(typeof response.body.uptime).toBe('number');
        expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });
});

// ============================================
// GRUPPO TEST: API V1 - TEST
// ============================================

describe('API V1 - Endpoint Test (/v1/test)', () => {
    /**
     * Test: L'endpoint /v1/test deve restituire result: true
     */
    test('GET /v1/test deve restituire result: true', async () => {
        const response = await request(app)
            .get('/v1/test')
            .expect('Content-Type', /json/)
            .expect(200);

        expect(response.body).toHaveProperty('result', true);
        expect(response.body).toHaveProperty('version', '1');
        expect(response.body).toHaveProperty('timestamp');
    });

    /**
     * Test: L'endpoint deve accettare query parameter message
     */
    test('GET /v1/test?message=ciao deve includere il messaggio', async () => {
        const response = await request(app)
            .get('/v1/test?message=ciao')
            .expect(200);

        expect(response.body).toHaveProperty('message', 'ciao');
    });

    /**
     * Test: L'endpoint deve accettare format=text
     */
    test('GET /v1/test?format=text deve restituire text/plain', async () => {
        const response = await request(app)
            .get('/v1/test?format=text')
            .expect('Content-Type', /text\/plain/)
            .expect(200);

        expect(response.text).toContain('Test superato');
    });

    /**
     * Test: format non valido deve essere rifiutato
     */
    test('GET /v1/test?format=xml deve restituire errore 400', async () => {
        const response = await request(app)
            .get('/v1/test?format=xml')
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
        expect(response.body).toHaveProperty('codice', 'VALIDATION_ERROR');
    });

    /**
     * Test: message troppo lungo deve essere rifiutato
     */
    test('GET /v1/test con message > 200 caratteri deve restituire errore', async () => {
        const messaggioLungo = 'a'.repeat(250);
        const response = await request(app)
            .get(`/v1/test?message=${messaggioLungo}`)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });
});

// ============================================
// GRUPPO TEST: API V1 - HEALTH
// ============================================

describe('API V1 - Endpoint Health (/v1/health)', () => {
    /**
     * Test: L'endpoint /v1/health deve restituire info complete
     */
    test('GET /v1/health deve restituire info complete', async () => {
        const response = await request(app)
            .get('/v1/health')
            .expect('Content-Type', /json/)
            .expect(200);

        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('versione');
        expect(response.body).toHaveProperty('uptime');
        expect(response.body).toHaveProperty('memoria');
        expect(response.body).toHaveProperty('sistema');
        expect(response.body).toHaveProperty('statistiche');
    });

    /**
     * Test: Le info di memoria devono essere valide
     */
    test('GET /v1/health deve contenere info memoria valide', async () => {
        const response = await request(app).get('/v1/health');

        expect(response.body.memoria).toHaveProperty('heapUsato');
        expect(response.body.memoria).toHaveProperty('heapTotale');
        expect(response.body.memoria).toHaveProperty('unita', 'MB');
        expect(response.body.memoria.heapUsato).toBeGreaterThan(0);
    });

    /**
     * Test: Le info di sistema devono essere valide
     */
    test('GET /v1/health deve contenere info sistema', async () => {
        const response = await request(app).get('/v1/health');

        expect(response.body.sistema).toHaveProperty('nodeVersion');
        expect(response.body.sistema).toHaveProperty('piattaforma');
        expect(response.body.sistema).toHaveProperty('architettura');
    });
});

// ============================================
// GRUPPO TEST: API V1 - INFO
// ============================================

describe('API V1 - Endpoint Info (/v1/info)', () => {
    /**
     * Test: L'endpoint /v1/info deve restituire info API
     */
    test('GET /v1/info deve restituire info API', async () => {
        const response = await request(app)
            .get('/v1/info')
            .expect('Content-Type', /json/)
            .expect(200);

        expect(response.body).toHaveProperty('nome', 'Voicenotes API');
        expect(response.body).toHaveProperty('versione', '1');
        expect(response.body).toHaveProperty('endpoints');
    });

    /**
     * Test: Deve elencare tutti gli endpoint disponibili
     */
    test('GET /v1/info deve elencare gli endpoint', async () => {
        const response = await request(app).get('/v1/info');

        expect(response.body.endpoints).toHaveProperty('test');
        expect(response.body.endpoints).toHaveProperty('health');
        expect(response.body.endpoints).toHaveProperty('info');
    });
});

// ============================================
// GRUPPO TEST: ERRORI 404
// ============================================

describe('Gestione Errori 404', () => {
    /**
     * Test: Endpoint non esistente deve restituire 404
     */
    test('GET /endpoint-non-esistente deve restituire 404', async () => {
        const response = await request(app)
            .get('/endpoint-non-esistente')
            .expect('Content-Type', /json/)
            .expect(404);

        expect(response.body).toHaveProperty('errore', 'Endpoint non trovato');
        expect(response.body).toHaveProperty('codice', 'NOT_FOUND');
        expect(response.body).toHaveProperty('endpointsDisponibili');
    });

    /**
     * Test: POST su endpoint GET-only deve restituire 404
     */
    test('POST /test deve restituire 404', async () => {
        const response = await request(app)
            .post('/test')
            .expect(404);

        expect(response.body).toHaveProperty('errore');
    });
});

// ============================================
// GRUPPO TEST: CORS HEADERS
// ============================================

describe('CORS Headers', () => {
    /**
     * Test: La risposta deve includere CORS headers
     */
    test('Le risposte devono includere Access-Control-Allow-Origin', async () => {
        const response = await request(app).get('/');

        expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    /**
     * Test: OPTIONS deve restituire 200
     */
    test('OPTIONS / deve restituire 200', async () => {
        const response = await request(app)
            .options('/')
            .expect(200);
    });
});

// ============================================
// GRUPPO TEST: RATE LIMIT HEADERS
// ============================================

describe('Rate Limit Headers', () => {
    /**
     * Test: La risposta deve includere headers rate limit
     * NOTA: Il rate limiting è disabilitato in ambiente di test (NODE_ENV=test)
     * per permettere ai test di funzionare senza essere bloccati.
     * Questo test verifica solo che la configurazione sia corretta.
     */
    test.skip('Le risposte devono includere RateLimit-* headers (skip: rate limiting disabilitato in test)', async () => {
        // Questo test viene saltato in ambiente di test perché il rate limiting
        // è disabilitato per permettere l'esecuzione di molti test in sequenza.
        // In ambiente di produzione, gli header RateLimit-* saranno presenti.
        const response = await request(app).get('/');

        // Verifichiamo che ci siano gli headers di rate limit standard
        expect(response.headers).toHaveProperty('ratelimit-limit');
        expect(response.headers).toHaveProperty('ratelimit-remaining');
    });
});

// ============================================
// GRUPPO TEST: SECURITY HEADERS
// ============================================

describe('Security Headers', () => {
    /**
     * Test: La risposta deve includere headers di sicurezza
     */
    test('Le risposte devono includere security headers', async () => {
        const response = await request(app).get('/');

        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
});

// ============================================
// GRUPPO TEST: API V1 - ASK (Assistente AI)
// ============================================

describe('API V1 - Endpoint Ask (/v1/ask)', () => {
    // UUID di test valido per le richieste
    const validUserId = '2198e343-eeeb-4361-be3b-7c8a826e193a';

    /**
     * Test: Richiesta senza userId deve restituire errore 400
     */
    test('POST /v1/ask senza userId deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/ask')
            .send({ query: 'Test query' })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
        expect(response.body).toHaveProperty('codice', 'VALIDATION_ERROR');
    });

    /**
     * Test: Richiesta senza query deve restituire errore 400
     */
    test('POST /v1/ask senza query deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/ask')
            .send({ userId: validUserId })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
        expect(response.body).toHaveProperty('codice', 'VALIDATION_ERROR');
    });

    /**
     * Test: userId non valido deve restituire errore 400
     */
    test('POST /v1/ask con userId non valido deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/ask')
            .send({
                userId: 'non-un-uuid-valido',
                query: 'Test query'
            })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });

    /**
     * Test: query troppo lunga deve restituire errore 400
     */
    test('POST /v1/ask con query > 2000 caratteri deve restituire errore 400', async () => {
        const queryLunga = 'a'.repeat(2100);
        const response = await request(app)
            .post('/v1/ask')
            .send({
                userId: validUserId,
                query: queryLunga
            })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });

    /**
     * Test: threshold fuori range deve restituire errore 400
     */
    test('POST /v1/ask con threshold > 1 deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/ask')
            .send({
                userId: validUserId,
                query: 'Test query',
                threshold: 1.5
            })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });

    /**
     * Test: count fuori range deve restituire errore 400
     */
    test('POST /v1/ask con count > 20 deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/ask')
            .send({
                userId: validUserId,
                query: 'Test query',
                count: 25
            })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });

    /**
     * Test: temperature fuori range deve restituire errore 400
     */
    test('POST /v1/ask con temperature < 0 deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/ask')
            .send({
                userId: validUserId,
                query: 'Test query',
                temperature: -0.5
            })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });

    /**
     * Test: maxTokens fuori range deve restituire errore 400
     */
    test('POST /v1/ask con maxTokens < 100 deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/ask')
            .send({
                userId: validUserId,
                query: 'Test query',
                maxTokens: 50
            })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });

    /**
     * Test: Richiesta valida deve restituire risposta con struttura corretta
     * Nota: Questo test potrebbe fallire se il servizio AI non è disponibile
     * o se l'utente non ha note nel database.
     */
    test('POST /v1/ask con parametri validi deve restituire risposta strutturata', async () => {
        const response = await request(app)
            .post('/v1/ask')
            .send({
                userId: validUserId,
                query: 'Test query'
            })
            .expect('Content-Type', /json/);

        // La risposta deve avere una struttura definita (anche in caso di errore)
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('metadata');
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('error');

        // Il metadata deve contenere informazioni sulla richiesta
        expect(response.body.metadata).toHaveProperty('timestamp');
        expect(response.body.metadata).toHaveProperty('processingTimeMs');
    });
});

// ============================================
// GRUPPO TEST: API V1 - EMBEDDINGS
// ============================================

describe('API V1 - Endpoint Embeddings (/v1/embeddings)', () => {
    // UUID di test valido per le richieste
    const validUserId = '2198e343-eeeb-4361-be3b-7c8a826e193a';

    /**
     * Test: Richiesta senza body deve funzionare (tutti i parametri sono opzionali)
     */
    test('POST /v1/embeddings senza body deve restituire risposta valida', async () => {
        const response = await request(app)
            .post('/v1/embeddings')
            .send({})
            .expect('Content-Type', /json/);

        // Può essere 200 o altro status a seconda dello stato del database
        // Ma deve sempre restituire la struttura corretta
        expect(response.body).toHaveProperty('result');
        expect(response.body).toHaveProperty('stats');
    });

    /**
     * Test: limit fuori range (> 50) deve restituire errore 400
     */
    test('POST /v1/embeddings con limit > 50 deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/embeddings')
            .send({ limit: 100 })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
        expect(response.body).toHaveProperty('codice', 'VALIDATION_ERROR');
    });

    /**
     * Test: limit fuori range (< 1) deve restituire errore 400
     */
    test('POST /v1/embeddings con limit < 1 deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/embeddings')
            .send({ limit: 0 })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });

    /**
     * Test: userId non valido deve restituire errore 400
     */
    test('POST /v1/embeddings con userId non valido deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/embeddings')
            .send({ userId: 'non-un-uuid-valido' })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });

    /**
     * Test: dryRun deve essere booleano
     */
    test('POST /v1/embeddings con dryRun stringa deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/embeddings')
            .send({ dryRun: 'yes' })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });

    /**
     * Test: Richiesta con parametri validi deve restituire risposta strutturata
     */
    test('POST /v1/embeddings con parametri validi deve contenere stats', async () => {
        const response = await request(app)
            .post('/v1/embeddings')
            .send({
                limit: 3,
                dryRun: true
            })
            .expect('Content-Type', /json/);

        expect(response.body).toHaveProperty('result');
        expect(response.body).toHaveProperty('stats');

        // Verifica struttura stats
        expect(response.body.stats).toHaveProperty('totalFound');
        expect(response.body.stats).toHaveProperty('processed');
        expect(response.body.stats).toHaveProperty('errors');
        expect(response.body.stats).toHaveProperty('skippedEmpty');
        expect(response.body.stats).toHaveProperty('skippedTooLong');
        expect(response.body.stats).toHaveProperty('apiCalls');
    });

    /**
     * Test: Richiesta con userId valido deve filtrare per utente
     */
    test('POST /v1/embeddings con userId valido deve essere accettato', async () => {
        const response = await request(app)
            .post('/v1/embeddings')
            .send({
                limit: 2,
                dryRun: true,
                userId: validUserId
            })
            .expect('Content-Type', /json/);

        // Non verifichiamo lo status perché dipende dallo stato del database
        // Ma verifichiamo che la richiesta sia stata elaborata correttamente
        expect(response.body).toHaveProperty('result');
        expect(response.body).toHaveProperty('stats');
    });

    /**
     * Test: La risposta deve includere duration
     */
    test('POST /v1/embeddings deve restituire duration', async () => {
        const response = await request(app)
            .post('/v1/embeddings')
            .send({ limit: 1, dryRun: true })
            .expect('Content-Type', /json/);

        expect(response.body).toHaveProperty('duration');
        expect(typeof response.body.duration).toBe('number');
        expect(response.body.duration).toBeGreaterThanOrEqual(0);
    });

    /**
     * Test: La risposta deve includere timestamp
     */
    test('POST /v1/embeddings deve restituire timestamp', async () => {
        const response = await request(app)
            .post('/v1/embeddings')
            .send({})
            .expect('Content-Type', /json/);

        expect(response.body).toHaveProperty('timestamp');
    });
});

// ============================================
// GRUPPO TEST: API V1 - INFO (aggiornato)
// ============================================

describe('API V1 - Endpoint Info aggiornato', () => {
    /**
     * Test: Deve elencare l'endpoint ask
     */
    test('GET /v1/info deve elencare endpoint ask', async () => {
        const response = await request(app).get('/v1/info');

        expect(response.body.endpoints).toHaveProperty('ask');
        expect(response.body.endpoints.ask).toHaveProperty('path', '/v1/ask');
        expect(response.body.endpoints.ask).toHaveProperty('metodo', 'POST');
    });

    /**
     * Test: Deve elencare l'endpoint embeddings
     */
    test('GET /v1/info deve elencare endpoint embeddings', async () => {
        const response = await request(app).get('/v1/info');

        expect(response.body.endpoints).toHaveProperty('embeddings');
        expect(response.body.endpoints.embeddings).toHaveProperty('path', '/v1/embeddings');
        expect(response.body.endpoints.embeddings).toHaveProperty('metodo', 'POST');
    });

    /**
     * Test: La versione deve essere 1.3.0
     */
    test('GET /v1/info deve restituire versione 1.3.0', async () => {
        const response = await request(app).get('/v1/info');

        expect(response.body).toHaveProperty('versioneCompleta', '1.3.0');
    });
});

// ============================================
// GRUPPO TEST: API V1 - HEALTH (aggiornato)
// ============================================

describe('API V1 - Health con nuovi servizi', () => {
    /**
     * Test: Health deve includere statistiche richieste embeddings
     */
    test('GET /v1/health deve includere richiesteEmbeddings', async () => {
        const response = await request(app).get('/v1/health');

        expect(response.body.statistiche).toHaveProperty('richiesteEmbeddings');
    });

    /**
     * Test: Health deve includere stato embeddingService
     */
    test('GET /v1/health deve includere embeddingService', async () => {
        const response = await request(app).get('/v1/health');

        expect(response.body.servizi).toHaveProperty('embeddingService');
        expect(response.body.servizi.embeddingService).toHaveProperty('status');
    });

    /**
     * Test: Health deve includere stato askService
     */
    test('GET /v1/health deve includere askService', async () => {
        const response = await request(app).get('/v1/health');

        expect(response.body.servizi).toHaveProperty('askService');
        expect(response.body.servizi.askService).toHaveProperty('status');
    });

    /**
     * Test: La versione nell'health deve essere 1.3.0
     */
    test('GET /v1/health deve restituire versione 1.3.0', async () => {
        const response = await request(app).get('/v1/health');

        expect(response.body).toHaveProperty('versione', '1.3.0');
    });
});
