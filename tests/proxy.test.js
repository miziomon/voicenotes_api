/**
 * ==============================================
 * Test Automatici - Supabase Proxy
 * ==============================================
 *
 * Questo file contiene i test automatici per verificare
 * il corretto funzionamento dell'endpoint Supabase Proxy.
 *
 * Framework utilizzato: Jest + Supertest
 *
 * Esecuzione:
 * npm test              → Esegue tutti i test con coverage
 *
 * Endpoint testato:
 * - POST /v1/supabase-proxy → Proxy trasparente Supabase
 *
 * @author Voicenotes API Team
 * @version 1.4.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

const request = require('supertest');
const app = require('../api/index');

// ============================================
// GRUPPO TEST: API V1 - SUPABASE PROXY
// ============================================

describe('API V1 - Endpoint Supabase Proxy (/v1/supabase-proxy)', () => {
    /**
     * Test: L'endpoint deve esistere e accettare richieste POST
     */
    test('POST /v1/supabase-proxy deve esistere', async () => {
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({})
            .expect('Content-Type', /json/);

        expect(response.status).toBeDefined();
    });

    /**
     * Test: Richiesta con body vuoto deve usare valori default
     */
    test('POST /v1/supabase-proxy con body vuoto deve rispondere', async () => {
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({})
            .expect('Content-Type', /json/);

        // Con body vuoto potrebbe fallire per vari motivi, ma deve rispondere
        expect(response.body).toBeDefined();
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
    });

    /**
     * Test: method non valido deve restituire errore 400
     */
    test('POST /v1/supabase-proxy con method non valido deve restituire errore 400', async () => {
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({
                method: 'INVALID_METHOD',
                path: '/rest/v1/notes'
            })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
        expect(response.body).toHaveProperty('codice', 'VALIDATION_ERROR');
    });

    /**
     * Test: path troppo lungo deve restituire errore 400
     */
    test('POST /v1/supabase-proxy con path > 500 caratteri deve restituire errore 400', async () => {
        const pathLungo = '/rest/v1/' + 'a'.repeat(500);
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({
                method: 'GET',
                path: pathLungo
            })
            .expect('Content-Type', /json/)
            .expect(400);

        expect(response.body).toHaveProperty('errore', 'Dati non validi');
    });

    /**
     * Test: Richiesta con metodo valido deve passare la validazione
     * Nota: Potrebbe fallire con 403/500 per motivi di Supabase o whitelist,
     * ma non deve fallire con 400 (validazione)
     */
    test('POST /v1/supabase-proxy con method=GET non deve fallire validazione', async () => {
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({
                method: 'GET',
                path: '/rest/v1/notes',
                query: { select: '*', limit: '1' }
            })
            .expect('Content-Type', /json/);

        // Non deve essere 400 (errore validazione)
        expect(response.status).not.toBe(400);

        // Deve avere una struttura di risposta
        expect(response.body).toBeDefined();
    });

    /**
     * Test: Tentativo di usare metodo pericoloso TRUNCATE deve essere bloccato
     * Nota: Potrebbe essere bloccato da tableWhitelist (403) o methodProtection (403)
     */
    test('POST /v1/supabase-proxy con TRUNCATE deve essere bloccato con 403', async () => {
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({
                method: 'POST',
                path: '/rest/v1/notes',
                body: {
                    query: 'TRUNCATE TABLE notes'
                }
            })
            .expect('Content-Type', /json/)
            .expect(403);

        // Deve essere bloccato (403) - potrebbe essere TABLE_ACCESS_DENIED o DANGEROUS_METHOD_BLOCKED
        expect(response.body).toHaveProperty('errore');
        expect(response.body).toHaveProperty('codice');
        expect(['TABLE_ACCESS_DENIED', 'DANGEROUS_METHOD_BLOCKED']).toContain(response.body.codice);
    });

    /**
     * Test: Tentativo di usare metodo pericoloso DROP deve essere bloccato
     */
    test('POST /v1/supabase-proxy con DROP deve essere bloccato con 403', async () => {
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({
                method: 'POST',
                path: '/rest/v1/notes',
                body: {
                    command: 'DROP TABLE notes'
                }
            })
            .expect('Content-Type', /json/)
            .expect(403);

        // Deve essere bloccato (403)
        expect(response.body).toHaveProperty('errore');
        expect(response.body).toHaveProperty('codice');
        expect(['TABLE_ACCESS_DENIED', 'DANGEROUS_METHOD_BLOCKED']).toContain(response.body.codice);
    });

    /**
     * Test: Risposta deve includere timestamp (quando non è un errore di validazione)
     */
    test('POST /v1/supabase-proxy deve includere timestamp nella risposta', async () => {
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({
                method: 'GET',
                path: '/rest/v1/notes',
                query: { limit: '1' }
            })
            .expect('Content-Type', /json/);

        // Tutte le risposte devono avere timestamp
        expect(response.body).toHaveProperty('timestamp');
    });

    /**
     * Test: La risposta deve avere struttura JSON valida
     */
    test('POST /v1/supabase-proxy deve restituire JSON valido', async () => {
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({
                method: 'GET',
                path: '/rest/v1/notes',
                query: { select: 'id', limit: '1' }
            })
            .expect('Content-Type', /json/);

        // Verifica che sia valid JSON
        expect(response.body).toBeDefined();
        expect(typeof response.body).toBe('object');

        // Se non è un errore di validazione, deve avere queste proprietà
        if (response.status !== 400) {
            expect(response.body).toHaveProperty('timestamp');
        }
    });

    /**
     * Test: Security headers devono essere presenti
     */
    test('POST /v1/supabase-proxy deve includere security headers', async () => {
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({
                method: 'GET',
                path: '/rest/v1/notes'
            });

        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    /**
      * Test: CORS headers devono essere presenti
      */
    test('POST /v1/supabase-proxy deve includere CORS headers', async () => {
        const response = await request(app)
            .post('/v1/supabase-proxy')
            .send({});

        expect(response.headers['access-control-allow-origin']).toBe('*');
    });
});
