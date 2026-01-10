/**
 * ==============================================
 * Script Pulizia Log Manuale
 * ==============================================
 *
 * Questo script permette di eseguire manualmente
 * la pulizia dei file di log più vecchi di 30 giorni.
 *
 * Nota: Winston Daily Rotate File esegue automaticamente
 * la pulizia, ma questo script può essere utile per
 * pulizie manuali o programmate tramite cron job.
 *
 * Utilizzo:
 * npm run clean:logs
 *
 * @author Voicenotes API Team
 * @version 1.1.0
 */

// ============================================
// IMPORTAZIONE DELLE DIPENDENZE
// ============================================

const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURAZIONE
// ============================================

// Directory dei log
const logsDirectory = path.join(__dirname, '..', 'logs');

// Numero di giorni dopo i quali eliminare i log
const GIORNI_RETENTION = 30;

// Calcoliamo la data limite (30 giorni fa)
const dataLimite = new Date();
dataLimite.setDate(dataLimite.getDate() - GIORNI_RETENTION);

// ============================================
// FUNZIONE PRINCIPALE
// ============================================

/**
 * Pulisce i file di log più vecchi della data limite
 */
function pulisciLog() {
    console.log('');
    console.log('='.repeat(50));
    console.log('🧹 PULIZIA FILE DI LOG');
    console.log('='.repeat(50));
    console.log('');
    console.log(`📅 Data limite: ${dataLimite.toISOString()}`);
    console.log(`📁 Directory log: ${logsDirectory}`);
    console.log('');

    // Verifichiamo se la directory esiste
    if (!fs.existsSync(logsDirectory)) {
        console.log('⚠️  Directory log non trovata. Nessun file da pulire.');
        return;
    }

    // Leggiamo i file nella directory
    const files = fs.readdirSync(logsDirectory);

    // Contatori per il report finale
    let eliminati = 0;
    let mantenuti = 0;
    let errori = 0;

    console.log(`📊 File trovati: ${files.length}`);
    console.log('');

    // Iteriamo sui file
    files.forEach(file => {
        const filePath = path.join(logsDirectory, file);

        try {
            // Otteniamo le informazioni sul file
            const stats = fs.statSync(filePath);

            // Verifichiamo se è un file (non una directory)
            if (!stats.isFile()) {
                return;
            }

            // Verifichiamo se il file è più vecchio della data limite
            if (stats.mtime < dataLimite) {
                // Eliminiamo il file
                fs.unlinkSync(filePath);
                console.log(`🗑️  Eliminato: ${file} (modificato: ${stats.mtime.toISOString()})`);
                eliminati++;
            } else {
                console.log(`✅ Mantenuto: ${file} (modificato: ${stats.mtime.toISOString()})`);
                mantenuti++;
            }
        } catch (error) {
            console.log(`❌ Errore su ${file}: ${error.message}`);
            errori++;
        }
    });

    // Report finale
    console.log('');
    console.log('='.repeat(50));
    console.log('📊 REPORT PULIZIA');
    console.log('='.repeat(50));
    console.log(`   ├── File eliminati: ${eliminati}`);
    console.log(`   ├── File mantenuti: ${mantenuti}`);
    console.log(`   └── Errori: ${errori}`);
    console.log('='.repeat(50));
    console.log('');
}

// ============================================
// ESECUZIONE
// ============================================

// Eseguiamo la pulizia
pulisciLog();
