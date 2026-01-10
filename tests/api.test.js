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
 * @author Voicenotes API Team
 * @version 1.1.0
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
     */
    test('Le risposte devono includere RateLimit-* headers', async () => {
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
