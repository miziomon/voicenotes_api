#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
EMBEDDING PROCESSOR PER VOICENOTES
=============================================================================
Script per generare embedding vettoriali delle note vocali usando OpenAI
o Google Gemini e salvarli su Supabase con pgvector.

Autore: AI Assistant
Versione: 1.2.0
Python: 3.12+
Data: 2026-01-09

Changelog:
    v1.2.0 (2026-01-09): Batch embedding per Gemini, task_type ottimizzato, logging su file
    v1.1.0 (2026-01-09): Aggiunto supporto per Google Gemini (gemini-embedding-001)
    v1.0.0 (2026-01-09): Versione iniziale con supporto OpenAI
=============================================================================
"""

# =============================================================================
# IMPORTAZIONE LIBRERIE
# =============================================================================

# Librerie standard Python
import os                   # Accesso alle variabili d'ambiente e percorsi file
import sys                  # Gestione uscita script e argomenti
import time                 # Gestione delay e timing
import json                 # Parsing JSON per il campo tags
import argparse             # Parsing argomenti da riga di comando
import logging              # Sistema di logging avanzato
from datetime import datetime  # Timestamp per i log
from typing import Optional, List, Dict, Any, Tuple  # Type hints per chiarezza
from enum import Enum       # Enum per i tipi di provider
from pathlib import Path    # Gestione percorsi file cross-platform

# Librerie esterne
from dotenv import load_dotenv  # Caricamento variabili da file .env
from supabase import create_client, Client  # Client Supabase
from openai import OpenAI  # Client OpenAI v1.0+
import google.generativeai as genai  # Client Google Gemini

# =============================================================================
# CONFIGURAZIONE GLOBALE
# =============================================================================

# Limite massimo di righe da processare per ogni esecuzione
# Questo evita timeout e sovraccarichi
BATCH_LIMIT = 50

# Delay in secondi tra ogni chiamata alle API di embedding
# Previene errori di rate limiting (429 Too Many Requests)
DELAY_BETWEEN_CALLS = 0.2

# Numero massimo di tentativi per una singola chiamata API
# Se fallisce, riprova con exponential backoff
MAX_RETRIES = 3

# Lunghezza massima del testo in caratteri per l'embedding
# Entrambi i modelli supportano testi abbastanza lunghi, ma usiamo un limite sicuro
MAX_TEXT_LENGTH = 8000

# Dimensione attesa del vettore (deve corrispondere alla colonna pgvector)
# Sia OpenAI text-embedding-3-small che Gemini (con output_dimensionality) generano 1536 dim
EXPECTED_VECTOR_DIMENSION = 1536

# Nome della tabella su Supabase
TABLE_NAME = "notes"

# =============================================================================
# CONFIGURAZIONE BATCH EMBEDDING PER GEMINI
# =============================================================================

# Dimensione del batch per le chiamate Gemini
# Gemini supporta fino a 100 testi per chiamata, usiamo 10 per sicurezza
GEMINI_BATCH_SIZE = 10

# Task type per ottimizzare gli embedding Gemini per la ricerca semantica
# Opzioni disponibili:
# - RETRIEVAL_QUERY: Per query di ricerca (testi brevi)
# - RETRIEVAL_DOCUMENT: Per documenti da indicizzare (testi lunghi)
# - SEMANTIC_SIMILARITY: Per confronto di similarità
# - CLASSIFICATION: Per classificazione di testo
# - CLUSTERING: Per clustering di documenti
# Usiamo RETRIEVAL_DOCUMENT perché stiamo indicizzando le note per la ricerca
GEMINI_TASK_TYPE = "RETRIEVAL_DOCUMENT"

# =============================================================================
# CONFIGURAZIONE LOGGING SU FILE
# =============================================================================

# Directory per i file di log (relativa allo script)
LOG_DIRECTORY = "logs"

# Formato del nome file di log: embedding_YYYY-MM-DD_HH-MM-SS.log
LOG_FILE_FORMAT = "embedding_{timestamp}.log"

# Formato dei messaggi di log
LOG_MESSAGE_FORMAT = "%(asctime)s | %(levelname)-8s | %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


# =============================================================================
# ENUM PER I PROVIDER DI EMBEDDING
# =============================================================================

class EmbeddingProvider(Enum):
    """
    Enum che definisce i provider disponibili per la generazione di embedding.

    Attributi:
        OPENAI: Usa OpenAI text-embedding-3-small
        GEMINI: Usa Google Gemini gemini-embedding-001
    """
    OPENAI = "openai"
    GEMINI = "gemini"


# =============================================================================
# CONFIGURAZIONE MODELLI PER PROVIDER
# =============================================================================

# Dizionario con le configurazioni specifiche per ogni provider
PROVIDER_CONFIG = {
    EmbeddingProvider.OPENAI: {
        "model": "text-embedding-3-small",  # Modello OpenAI per embedding
        "env_var": "OPENAI_API_KEY",        # Variabile d'ambiente per la chiave API
        "display_name": "OpenAI",           # Nome visualizzato nei log
        "supports_batch": False,            # OpenAI supporta batch ma con API diversa
    },
    EmbeddingProvider.GEMINI: {
        "model": "models/gemini-embedding-001",  # Modello Gemini per embedding
        "env_var": "GEMINI_API_KEY",             # Variabile d'ambiente per la chiave API
        "display_name": "Google Gemini",         # Nome visualizzato nei log
        "supports_batch": True,                  # Gemini supporta batch embedding
    },
}


# =============================================================================
# CLASSE PER IL LOGGING PERSONALIZZATO
# =============================================================================

class DualLogger:
    """
    Logger personalizzato che scrive sia su console che su file.

    Utilizza emoji per i messaggi su console e formattazione standard per i file.
    I file di log vengono creati nella directory 'logs' con timestamp nel nome.

    Attributi:
        logger (logging.Logger): Logger Python standard
        log_file_path (Path): Percorso del file di log corrente
    """

    def __init__(self, script_dir: Path):
        """
        Inizializza il logger con output su console e file.

        Args:
            script_dir: Directory dove si trova lo script (per creare la cartella logs)
        """
        # Crea la directory dei log se non esiste
        self.log_dir = script_dir / LOG_DIRECTORY
        self.log_dir.mkdir(exist_ok=True)

        # Genera il nome del file di log con timestamp
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        log_filename = LOG_FILE_FORMAT.format(timestamp=timestamp)
        self.log_file_path = self.log_dir / log_filename

        # Configura il logger Python
        self.logger = logging.getLogger("EmbeddingProcessor")
        self.logger.setLevel(logging.DEBUG)

        # Rimuove handler esistenti per evitare duplicati
        self.logger.handlers.clear()

        # -----------------------------------------------------------------
        # HANDLER PER FILE - Salva tutti i messaggi con formattazione standard
        # -----------------------------------------------------------------
        file_handler = logging.FileHandler(
            self.log_file_path,
            encoding="utf-8",
            mode="w"  # Sovrascrive se esiste
        )
        file_handler.setLevel(logging.DEBUG)
        file_formatter = logging.Formatter(LOG_MESSAGE_FORMAT, datefmt=LOG_DATE_FORMAT)
        file_handler.setFormatter(file_formatter)
        self.logger.addHandler(file_handler)

        # Scrive l'header nel file di log
        self._write_log_header()

    def _write_log_header(self) -> None:
        """
        Scrive un header informativo all'inizio del file di log.
        """
        self.logger.info("=" * 70)
        self.logger.info("EMBEDDING PROCESSOR - LOG FILE")
        self.logger.info(f"Data creazione: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        self.logger.info(f"Sistema operativo: {sys.platform}")
        self.logger.info(f"Python: {sys.version}")
        self.logger.info("=" * 70)

    def _get_timestamp(self) -> str:
        """Restituisce il timestamp corrente formattato per la console."""
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def info(self, message: str, console_emoji: str = "ℹ️ ") -> None:
        """
        Log informativo - scrive su console con emoji e su file.

        Args:
            message: Messaggio da loggare
            console_emoji: Emoji da mostrare su console (default: ℹ️)
        """
        # Console con emoji
        print(f"[{self._get_timestamp()}] {console_emoji} {message}")
        # File senza emoji
        self.logger.info(message)

    def success(self, message: str) -> None:
        """
        Log di successo - scrive su console con emoji verde e su file.

        Args:
            message: Messaggio da loggare
        """
        print(f"[{self._get_timestamp()}] ✅ {message}")
        self.logger.info(f"[SUCCESS] {message}")

    def warning(self, message: str) -> None:
        """
        Log di avviso - scrive su console con emoji gialla e su file.

        Args:
            message: Messaggio da loggare
        """
        print(f"[{self._get_timestamp()}] ⚠️  {message}")
        self.logger.warning(message)

    def error(self, message: str) -> None:
        """
        Log di errore - scrive su console con emoji rossa e su file.

        Args:
            message: Messaggio da loggare
        """
        print(f"[{self._get_timestamp()}] ❌ {message}")
        self.logger.error(message)

    def processing(self, note_id: Any, title: str) -> None:
        """
        Log durante il processing di una nota.

        Args:
            note_id: ID della nota
            title: Titolo della nota
        """
        # Tronca il titolo se troppo lungo
        display_title = title[:50] + "..." if len(title) > 50 else title
        message = f"Processando nota ID {note_id}: \"{display_title}\""
        print(f"[{self._get_timestamp()}] 🔄 {message}")
        self.logger.info(message)

    def debug(self, message: str) -> None:
        """
        Log di debug - scrive solo su file, non su console.

        Args:
            message: Messaggio da loggare
        """
        self.logger.debug(message)

    def print_raw(self, message: str) -> None:
        """
        Stampa un messaggio raw su console e lo logga come info.

        Args:
            message: Messaggio da stampare
        """
        print(message)
        # Rimuove eventuali caratteri speciali per il file
        clean_message = message.replace("📊", "[STATS]").replace("💡", "[TIP]")
        clean_message = clean_message.replace("•", "-").replace("✅", "[OK]")
        clean_message = clean_message.replace("⚠️", "[WARN]").replace("❌", "[ERR]")
        self.logger.info(clean_message)

    def get_log_file_path(self) -> Path:
        """Restituisce il percorso del file di log corrente."""
        return self.log_file_path


# =============================================================================
# CLASSE PRINCIPALE: EmbeddingProcessor
# =============================================================================

class EmbeddingProcessor:
    """
    Classe principale per processare le note e generare embedding.

    Gestisce:
    - Connessione a Supabase
    - Generazione embedding con OpenAI o Google Gemini
    - Batch embedding per Gemini (più efficiente)
    - Retry con exponential backoff
    - Logging su console e file
    - Report finale dettagliato

    Attributi:
        provider (EmbeddingProvider): Provider scelto per generare embedding
        dry_run (bool): Se True, simula le operazioni senza scrivere sul database
        logger (DualLogger): Logger per console e file
        stats (dict): Contatori per le statistiche finali
        skipped_notes (list): Note saltate per testo troppo lungo
        error_notes (list): Note con errori durante il processing
    """

    def __init__(self, provider: EmbeddingProvider, dry_run: bool = False):
        """
        Inizializza il processore caricando le configurazioni.

        Args:
            provider: Provider da usare per generare embedding (OpenAI o Gemini)
            dry_run: Se True, simula le operazioni senza scrivere sul database
        """
        # Salva il provider selezionato
        self.provider = provider

        # Modalità dry-run per test senza modifiche al DB
        self.dry_run = dry_run

        # Inizializza il logger (console + file)
        script_dir = Path(__file__).parent
        self.logger = DualLogger(script_dir)

        # Contatori per il report finale
        self.stats = {
            "total_found": 0,       # Note trovate da processare
            "processed": 0,          # Note processate con successo
            "errors": 0,             # Note con errori
            "skipped_too_long": 0,   # Note saltate perché troppo lunghe
            "skipped_empty": 0,      # Note saltate perché senza contenuto
            "api_calls": 0,          # Numero di chiamate API effettuate
        }

        # Lista delle note saltate per testo troppo lungo
        # Contiene dizionari con: id, titolo, lunghezza_testo
        self.skipped_notes: List[Dict[str, Any]] = []

        # Lista degli errori riscontrati
        # Contiene dizionari con: id, titolo, messaggio_errore
        self.error_notes: List[Dict[str, Any]] = []

        # Timestamp di inizio per calcolare la durata totale
        self.start_time: Optional[float] = None

        # Client per il provider di embedding (inizializzato in _init_clients)
        self.openai_client: Optional[OpenAI] = None

        # Inizializza i client API
        self._init_clients()

    def _init_clients(self) -> None:
        """
        Inizializza i client Supabase e il provider di embedding selezionato.

        Carica le variabili d'ambiente dal file .env e verifica
        che tutte le chiavi necessarie siano presenti.

        Raises:
            SystemExit: Se mancano variabili d'ambiente richieste
        """
        # Carica le variabili d'ambiente dal file .env
        # override=True permette di sovrascrivere variabili già esistenti nel sistema
        load_dotenv(override=True)

        # Legge le variabili d'ambiente per Supabase (richieste sempre)
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")

        # Ottiene la configurazione del provider selezionato
        provider_config = PROVIDER_CONFIG[self.provider]

        # Legge la chiave API del provider selezionato
        provider_api_key = os.getenv(provider_config["env_var"])

        # Verifica che tutte le variabili siano presenti
        missing_vars = []
        if not supabase_url:
            missing_vars.append("SUPABASE_URL")
        if not supabase_key:
            missing_vars.append("SUPABASE_KEY")
        if not provider_api_key:
            missing_vars.append(provider_config["env_var"])

        # Se mancano variabili, mostra errore ed esce dallo script
        if missing_vars:
            self.logger.error(f"Variabili d'ambiente mancanti: {', '.join(missing_vars)}")
            self.logger.error("Assicurati di configurare il file .env correttamente.")
            sys.exit(1)

        # -----------------------------------------------------------------
        # INIZIALIZZAZIONE CLIENT SUPABASE
        # -----------------------------------------------------------------
        self.logger.info("Connessione a Supabase...")
        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.logger.success("Connessione a Supabase stabilita")

        # -----------------------------------------------------------------
        # INIZIALIZZAZIONE CLIENT PROVIDER EMBEDDING
        # -----------------------------------------------------------------
        if self.provider == EmbeddingProvider.OPENAI:
            # Inizializza il client OpenAI
            self.logger.info(f"Inizializzazione client {provider_config['display_name']}...")
            self.openai_client = OpenAI(api_key=provider_api_key)
            self.logger.success(f"Client {provider_config['display_name']} inizializzato")
            self.logger.info(f"Modello: {provider_config['model']}")

        elif self.provider == EmbeddingProvider.GEMINI:
            # Inizializza il client Google Gemini
            self.logger.info(f"Inizializzazione client {provider_config['display_name']}...")
            # Configura la chiave API globalmente per la libreria google-generativeai
            genai.configure(api_key=provider_api_key)
            self.logger.success(f"Client {provider_config['display_name']} inizializzato")
            self.logger.info(f"Modello: {provider_config['model']} (dimensione forzata a {EXPECTED_VECTOR_DIMENSION})")
            self.logger.info(f"Task type: {GEMINI_TASK_TYPE} (ottimizzato per ricerca semantica)")
            self.logger.info(f"Batch size: {GEMINI_BATCH_SIZE} testi per chiamata API")

    # =========================================================================
    # METODI PER LA GESTIONE DEI DATI
    # =========================================================================

    def _build_text_for_embedding(self, note: Dict[str, Any]) -> str:
        """
        Costruisce il testo da inviare al provider per generare l'embedding.

        Combina i campi disponibili in modo intelligente per massimizzare
        la qualità della ricerca semantica. I campi nulli vengono ignorati.

        Formato risultante:
        "Title: [titolo] | Excerpt: [estratto] | Category: [categorie] | Tags: [tag1, tag2] | Content: [trascrizione]"

        Args:
            note: Dizionario con i dati della nota dal database

        Returns:
            Stringa formattata pronta per la generazione dell'embedding
        """
        # Inizializza la lista delle parti del testo
        parts = []

        # -----------------------------------------------------------------
        # TITOLO - Campo principale per la ricerca
        # -----------------------------------------------------------------
        title = note.get("title") or ""
        if title.strip():
            parts.append(f"Title: {title.strip()}")

        # -----------------------------------------------------------------
        # EXCERPT - Riassunto breve della nota
        # -----------------------------------------------------------------
        excerpt = note.get("excerpt") or ""
        if excerpt.strip():
            parts.append(f"Excerpt: {excerpt.strip()}")

        # -----------------------------------------------------------------
        # CATEGORIE - Stringa con categorie separate da virgole
        # -----------------------------------------------------------------
        categories = note.get("categories") or ""
        if categories.strip():
            parts.append(f"Category: {categories.strip()}")

        # -----------------------------------------------------------------
        # TAGS - Array JSON con etichette della nota
        # -----------------------------------------------------------------
        tags = note.get("tags")
        if tags:
            # Se è una stringa, prova a parsarla come JSON
            if isinstance(tags, str):
                try:
                    tags = json.loads(tags)
                except json.JSONDecodeError:
                    # Se non è JSON valido, usala come stringa singola
                    tags = [tags]

            # Se è una lista non vuota, unisci gli elementi con virgole
            if isinstance(tags, list) and len(tags) > 0:
                tags_str = ", ".join(str(tag) for tag in tags)
                parts.append(f"Tags: {tags_str}")

        # -----------------------------------------------------------------
        # TRANSCRIPTION - Contenuto principale della nota vocale
        # -----------------------------------------------------------------
        transcription = note.get("transcription") or ""
        if transcription.strip():
            parts.append(f"Content: {transcription.strip()}")

        # Unisce tutte le parti con il separatore " | "
        return " | ".join(parts)

    def _generate_embedding_openai(self, text: str) -> List[float]:
        """
        Genera l'embedding usando OpenAI text-embedding-3-small.

        Args:
            text: Testo da convertire in embedding

        Returns:
            Lista di float rappresentante il vettore a 1536 dimensioni

        Raises:
            Exception: Se la chiamata API fallisce
        """
        # Ottiene la configurazione del modello
        model = PROVIDER_CONFIG[EmbeddingProvider.OPENAI]["model"]

        # Chiama l'API OpenAI per generare l'embedding
        response = self.openai_client.embeddings.create(
            model=model,
            input=text
        )

        # Incrementa contatore chiamate API
        self.stats["api_calls"] += 1

        # Estrae il vettore dalla risposta
        embedding = response.data[0].embedding

        return embedding

    def _generate_embedding_gemini(self, text: str) -> List[float]:
        """
        Genera l'embedding usando Google Gemini gemini-embedding-001.

        Utilizza il parametro output_dimensionality per forzare la dimensione
        del vettore a 1536, compatibile con la colonna pgvector.
        Utilizza task_type per ottimizzare l'embedding per la ricerca semantica.

        Args:
            text: Testo da convertire in embedding

        Returns:
            Lista di float rappresentante il vettore a 1536 dimensioni

        Raises:
            Exception: Se la chiamata API fallisce
        """
        # Ottiene la configurazione del modello
        model = PROVIDER_CONFIG[EmbeddingProvider.GEMINI]["model"]

        # Chiama l'API Gemini per generare l'embedding
        # - output_dimensionality: forza la dimensione a 1536
        # - task_type: ottimizza per il tipo di utilizzo (ricerca documenti)
        response = genai.embed_content(
            model=model,
            content=text,
            output_dimensionality=EXPECTED_VECTOR_DIMENSION,
            task_type=GEMINI_TASK_TYPE
        )

        # Incrementa contatore chiamate API
        self.stats["api_calls"] += 1

        # Estrae il vettore dalla risposta
        # La struttura della risposta Gemini è: response['embedding']
        embedding = response['embedding']

        return embedding

    def _generate_embeddings_gemini_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Genera embedding per più testi in una singola chiamata API Gemini.

        Questo metodo è più efficiente rispetto a chiamate singole perché riduce
        l'overhead di rete e il numero totale di chiamate API.

        Args:
            texts: Lista di testi da convertire in embedding

        Returns:
            Lista di vettori embedding (uno per ogni testo)

        Raises:
            Exception: Se la chiamata API fallisce
        """
        # Ottiene la configurazione del modello
        model = PROVIDER_CONFIG[EmbeddingProvider.GEMINI]["model"]

        # Log per debug
        self.logger.debug(f"Batch embedding Gemini: {len(texts)} testi")

        # Chiama l'API Gemini per generare gli embedding in batch
        # - content: lista di testi
        # - output_dimensionality: forza la dimensione a 1536
        # - task_type: ottimizza per il tipo di utilizzo
        response = genai.embed_content(
            model=model,
            content=texts,
            output_dimensionality=EXPECTED_VECTOR_DIMENSION,
            task_type=GEMINI_TASK_TYPE
        )

        # Incrementa contatore chiamate API (1 chiamata per tutto il batch)
        self.stats["api_calls"] += 1

        # Estrae i vettori dalla risposta
        # Per batch, la struttura è: response['embedding'] è una lista di vettori
        embeddings = response['embedding']

        return embeddings

    def _generate_embedding_with_retry(self, text: str, note_id: Any) -> Optional[List[float]]:
        """
        Genera l'embedding per un testo con retry e exponential backoff.

        Seleziona automaticamente il metodo di generazione in base al provider
        configurato. In caso di errore, riprova fino a MAX_RETRIES volte
        con delay crescente (exponential backoff).

        Args:
            text: Testo da convertire in embedding
            note_id: ID della nota (usato per i log in caso di errore)

        Returns:
            Lista di float rappresentante il vettore, o None in caso di errore
        """
        # Ottiene il nome del provider per i log
        provider_name = PROVIDER_CONFIG[self.provider]["display_name"]

        # Tenta la chiamata API con retry
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                # -----------------------------------------------------------------
                # SELEZIONA IL METODO DI GENERAZIONE IN BASE AL PROVIDER
                # -----------------------------------------------------------------
                if self.provider == EmbeddingProvider.OPENAI:
                    embedding = self._generate_embedding_openai(text)
                elif self.provider == EmbeddingProvider.GEMINI:
                    embedding = self._generate_embedding_gemini(text)
                else:
                    raise ValueError(f"Provider non supportato: {self.provider}")

                # -----------------------------------------------------------------
                # VERIFICA LA DIMENSIONE DEL VETTORE
                # -----------------------------------------------------------------
                if len(embedding) != EXPECTED_VECTOR_DIMENSION:
                    self.logger.warning(
                        f"Dimensione embedding inattesa: {len(embedding)} "
                        f"(atteso: {EXPECTED_VECTOR_DIMENSION})"
                    )

                return embedding

            except Exception as e:
                # Calcola il tempo di attesa con exponential backoff
                # Formula: 2^attempt secondi (2, 4, 8, ...)
                wait_time = 2 ** attempt

                if attempt < MAX_RETRIES:
                    self.logger.warning(
                        f"Tentativo {attempt}/{MAX_RETRIES} fallito per nota {note_id} "
                        f"({provider_name}): {str(e)}. Riprovo tra {wait_time}s..."
                    )
                    time.sleep(wait_time)
                else:
                    self.logger.error(
                        f"Tutti i tentativi falliti per nota {note_id} "
                        f"({provider_name}): {str(e)}"
                    )
                    return None

        return None

    def _generate_embeddings_batch_with_retry(
        self,
        texts_with_ids: List[Tuple[str, Any, str]]
    ) -> Dict[Any, Optional[List[float]]]:
        """
        Genera embedding per un batch di testi con retry e exponential backoff.

        Questo metodo è specifico per Gemini e permette di processare più testi
        in una singola chiamata API, riducendo significativamente il tempo totale.

        Args:
            texts_with_ids: Lista di tuple (testo, note_id, titolo)

        Returns:
            Dizionario {note_id: embedding} dove embedding può essere None in caso di errore
        """
        provider_name = PROVIDER_CONFIG[self.provider]["display_name"]

        # Estrae solo i testi per la chiamata API
        texts = [t[0] for t in texts_with_ids]
        note_ids = [t[1] for t in texts_with_ids]

        # Tenta la chiamata API con retry
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                # Genera tutti gli embedding in una singola chiamata
                embeddings = self._generate_embeddings_gemini_batch(texts)

                # Verifica le dimensioni dei vettori
                for i, embedding in enumerate(embeddings):
                    if len(embedding) != EXPECTED_VECTOR_DIMENSION:
                        self.logger.warning(
                            f"Dimensione embedding inattesa per nota {note_ids[i]}: "
                            f"{len(embedding)} (atteso: {EXPECTED_VECTOR_DIMENSION})"
                        )

                # Costruisce il dizionario di risultati
                return dict(zip(note_ids, embeddings))

            except Exception as e:
                wait_time = 2 ** attempt

                if attempt < MAX_RETRIES:
                    self.logger.warning(
                        f"Tentativo {attempt}/{MAX_RETRIES} fallito per batch "
                        f"({provider_name}): {str(e)}. Riprovo tra {wait_time}s..."
                    )
                    time.sleep(wait_time)
                else:
                    self.logger.error(
                        f"Tutti i tentativi falliti per batch ({provider_name}): {str(e)}"
                    )
                    # Restituisce None per tutte le note del batch
                    return {note_id: None for note_id in note_ids}

        return {note_id: None for note_id in note_ids}

    def _update_note_embedding(self, note_id: Any, embedding: List[float]) -> bool:
        """
        Aggiorna il campo embedding di una nota su Supabase.

        Args:
            note_id: ID della nota da aggiornare
            embedding: Vettore embedding da salvare (lista di 1536 float)

        Returns:
            True se l'aggiornamento è riuscito, False altrimenti
        """
        try:
            # Se siamo in modalità dry-run, simula l'aggiornamento senza scrivere
            if self.dry_run:
                self.logger.info(f"[DRY-RUN] Simulato aggiornamento nota {note_id}")
                return True

            # Esegue l'UPDATE su Supabase
            # Il vettore viene passato direttamente come lista Python
            # Supabase/pgvector lo converte automaticamente nel formato corretto
            response = self.supabase.table(TABLE_NAME).update({
                "embedding": embedding
            }).eq("id", note_id).execute()

            # Verifica che l'update abbia avuto successo
            if response.data:
                return True
            else:
                self.logger.warning(f"Nessun dato restituito per nota {note_id}")
                return False

        except Exception as e:
            self.logger.error(f"Errore durante l'aggiornamento della nota {note_id}: {str(e)}")
            return False

    # =========================================================================
    # METODO PRINCIPALE DI PROCESSING
    # =========================================================================

    def process(self) -> None:
        """
        Metodo principale che orchestra l'intero processo di embedding.

        Esegue i seguenti step:
        1. Recupera le note da processare dal database
        2. Prepara i testi per l'embedding
        3. Genera gli embedding (singolarmente o in batch)
        4. Aggiorna il database con i vettori generati
        5. Mostra il report finale con statistiche e dettagli
        """
        # Registra il timestamp di inizio per calcolare la durata totale
        self.start_time = time.time()

        # Ottiene il nome del provider per i log
        provider_name = PROVIDER_CONFIG[self.provider]["display_name"]
        model_name = PROVIDER_CONFIG[self.provider]["model"]
        supports_batch = PROVIDER_CONFIG[self.provider]["supports_batch"]

        # -----------------------------------------------------------------
        # BANNER INIZIALE
        # -----------------------------------------------------------------
        self.logger.print_raw("\n" + "=" * 70)
        self.logger.print_raw("  EMBEDDING PROCESSOR PER VOICENOTES")
        self.logger.print_raw("=" * 70)
        self.logger.print_raw(f"  Provider: {provider_name}")
        self.logger.print_raw(f"  Modello:  {model_name}")
        if self.provider == EmbeddingProvider.GEMINI:
            self.logger.print_raw(f"  Batch:    Abilitato ({GEMINI_BATCH_SIZE} testi/chiamata)")
            self.logger.print_raw(f"  Task:     {GEMINI_TASK_TYPE}")
        self.logger.print_raw(f"  Log file: {self.logger.get_log_file_path()}")
        self.logger.print_raw("=" * 70)

        # Avviso se siamo in modalità dry-run
        if self.dry_run:
            self.logger.warning("MODALITÀ DRY-RUN ATTIVA - Nessuna modifica sarà salvata")

        print()

        # -----------------------------------------------------------------
        # STEP 1: Recupera le note da processare
        # -----------------------------------------------------------------
        self.logger.info(f"Recupero note con status='completed' e embedding=NULL (limit: {BATCH_LIMIT})...")

        try:
            # Query Supabase per le note da processare
            # Seleziona solo i campi necessari per ottimizzare la query
            response = self.supabase.table(TABLE_NAME).select(
                "id, title, excerpt, categories, tags, transcription"
            ).eq(
                "status", "completed"
            ).is_(
                "embedding", "null"
            ).limit(
                BATCH_LIMIT
            ).execute()

            notes = response.data

        except Exception as e:
            self.logger.error(f"Errore durante il recupero delle note: {str(e)}")
            sys.exit(1)

        # Verifica se ci sono note da processare
        self.stats["total_found"] = len(notes)

        if not notes:
            self.logger.success("Nessuna nota da processare. Tutte le note hanno già un embedding!")
            self._print_final_report()
            return

        self.logger.success(f"Trovate {len(notes)} note da processare")
        print()

        # -----------------------------------------------------------------
        # STEP 2: Conta il totale delle note pendenti (informazione aggiuntiva)
        # -----------------------------------------------------------------
        try:
            total_pending_response = self.supabase.table(TABLE_NAME).select(
                "id", count="exact"
            ).eq(
                "status", "completed"
            ).is_(
                "embedding", "null"
            ).execute()

            total_pending = total_pending_response.count or len(notes)

            # Mostra avviso se ci sono più note di quelle che verranno processate
            if total_pending > BATCH_LIMIT:
                self.logger.info(
                    f"Nota: Ci sono {total_pending} note totali da processare. "
                    f"Questo batch ne processerà {BATCH_LIMIT}."
                )
                print()

        except Exception:
            # Se fallisce il conteggio, non è critico, continuiamo comunque
            pass

        # -----------------------------------------------------------------
        # STEP 3: Prepara le note filtrando quelle problematiche
        # -----------------------------------------------------------------
        valid_notes: List[Tuple[Dict[str, Any], str]] = []  # (nota, testo)

        for note in notes:
            note_id = note.get("id")
            title = note.get("title") or "Senza titolo"

            # Costruisce il testo combinato per l'embedding
            text = self._build_text_for_embedding(note)

            # Verifica: Il testo non deve essere vuoto
            if not text.strip():
                self.logger.warning(f"Nota {note_id} saltata: nessun contenuto testuale")
                self.stats["skipped_empty"] += 1
                continue

            # Verifica: Il testo non deve superare la lunghezza massima
            if len(text) > MAX_TEXT_LENGTH:
                self.logger.warning(
                    f"Nota {note_id} saltata: testo troppo lungo "
                    f"({len(text)} caratteri, max: {MAX_TEXT_LENGTH})"
                )
                self.stats["skipped_too_long"] += 1
                self.skipped_notes.append({
                    "id": note_id,
                    "title": title,
                    "text_length": len(text)
                })
                continue

            valid_notes.append((note, text))

        if not valid_notes:
            self.logger.warning("Nessuna nota valida da processare dopo i filtri.")
            self._print_final_report()
            return

        self.logger.info(f"{len(valid_notes)} note valide pronte per l'elaborazione")
        print()

        # -----------------------------------------------------------------
        # STEP 4: Processa le note (batch per Gemini, singolo per OpenAI)
        # -----------------------------------------------------------------
        if self.provider == EmbeddingProvider.GEMINI and supports_batch:
            self._process_notes_batch(valid_notes)
        else:
            self._process_notes_single(valid_notes)

        # -----------------------------------------------------------------
        # STEP 5: Report finale
        # -----------------------------------------------------------------
        self._print_final_report()

    def _process_notes_single(self, valid_notes: List[Tuple[Dict[str, Any], str]]) -> None:
        """
        Processa le note una alla volta (usato per OpenAI).

        Args:
            valid_notes: Lista di tuple (nota, testo) valide
        """
        for index, (note, text) in enumerate(valid_notes, 1):
            note_id = note.get("id")
            title = note.get("title") or "Senza titolo"

            # Log del progresso con contatore
            print(f"\n[{index}/{len(valid_notes)}] ", end="")
            self.logger.processing(note_id, title)

            # Genera l'embedding
            embedding = self._generate_embedding_with_retry(text, note_id)

            if embedding is None:
                # La generazione è fallita dopo tutti i retry
                self.stats["errors"] += 1
                self.error_notes.append({
                    "id": note_id,
                    "title": title,
                    "error": "Generazione embedding fallita"
                })
                continue

            # Aggiorna il database
            if self._update_note_embedding(note_id, embedding):
                self.logger.success(f"Embedding aggiornato con successo per nota {note_id}")
                self.stats["processed"] += 1
            else:
                self.stats["errors"] += 1
                self.error_notes.append({
                    "id": note_id,
                    "title": title,
                    "error": "Aggiornamento database fallito"
                })

            # Delay tra le chiamate per evitare rate limiting
            # Non aspettare dopo l'ultima nota
            if index < len(valid_notes):
                time.sleep(DELAY_BETWEEN_CALLS)

    def _process_notes_batch(self, valid_notes: List[Tuple[Dict[str, Any], str]]) -> None:
        """
        Processa le note in batch (usato per Gemini).

        Raggruppa le note in batch di GEMINI_BATCH_SIZE e genera gli embedding
        con una singola chiamata API per batch. Questo è molto più efficiente.

        Args:
            valid_notes: Lista di tuple (nota, testo) valide
        """
        total_notes = len(valid_notes)

        self.logger.info(
            f"Elaborazione in batch: {total_notes} note in "
            f"~{(total_notes + GEMINI_BATCH_SIZE - 1) // GEMINI_BATCH_SIZE} chiamate API"
        )

        # Processa le note in batch
        for batch_start in range(0, total_notes, GEMINI_BATCH_SIZE):
            batch_end = min(batch_start + GEMINI_BATCH_SIZE, total_notes)
            batch_notes = valid_notes[batch_start:batch_end]

            # Mostra progresso del batch
            print(f"\n[Batch {batch_start // GEMINI_BATCH_SIZE + 1}] ", end="")
            self.logger.info(f"Processando note {batch_start + 1}-{batch_end} di {total_notes}...")

            # Prepara i dati per il batch
            texts_with_ids = [
                (text, note.get("id"), note.get("title") or "Senza titolo")
                for note, text in batch_notes
            ]

            # Genera gli embedding in batch
            embeddings = self._generate_embeddings_batch_with_retry(texts_with_ids)

            # Aggiorna il database per ogni nota del batch
            for note, text in batch_notes:
                note_id = note.get("id")
                title = note.get("title") or "Senza titolo"
                embedding = embeddings.get(note_id)

                if embedding is None:
                    self.stats["errors"] += 1
                    self.error_notes.append({
                        "id": note_id,
                        "title": title,
                        "error": "Generazione embedding fallita nel batch"
                    })
                    continue

                # Aggiorna il database
                if self._update_note_embedding(note_id, embedding):
                    self.logger.success(f"Embedding aggiornato con successo per nota {note_id}")
                    self.stats["processed"] += 1
                else:
                    self.stats["errors"] += 1
                    self.error_notes.append({
                        "id": note_id,
                        "title": title,
                        "error": "Aggiornamento database fallito"
                    })

            # Delay tra i batch per evitare rate limiting
            if batch_end < total_notes:
                time.sleep(DELAY_BETWEEN_CALLS)

    def _print_final_report(self) -> None:
        """
        Stampa il report finale con statistiche dettagliate.

        Include:
        - Note trovate, processate, con errori, saltate
        - Numero di chiamate API effettuate
        - Tempo totale di esecuzione
        - Dettaglio delle note saltate per testo troppo lungo
        - Dettaglio delle note con errori
        - Percorso del file di log
        """
        # Calcola la durata totale dell'esecuzione
        duration = time.time() - self.start_time if self.start_time else 0
        minutes, seconds = divmod(int(duration), 60)

        # Ottiene il nome del provider per il report
        provider_name = PROVIDER_CONFIG[self.provider]["display_name"]

        self.logger.print_raw("\n")
        self.logger.print_raw("=" * 70)
        self.logger.print_raw("  REPORT FINALE")
        self.logger.print_raw("=" * 70)
        self.logger.print_raw("")

        # -----------------------------------------------------------------
        # STATISTICHE GENERALI
        # -----------------------------------------------------------------
        self.logger.print_raw("📊 STATISTICHE:")
        self.logger.print_raw(f"   • Provider utilizzato:       {provider_name}")
        self.logger.print_raw(f"   • Note trovate:              {self.stats['total_found']}")
        self.logger.print_raw(f"   • Note processate:           {self.stats['processed']}")
        self.logger.print_raw(f"   • Note con errori:           {self.stats['errors']}")
        self.logger.print_raw(f"   • Note saltate (troppo lunghe): {self.stats['skipped_too_long']}")
        self.logger.print_raw(f"   • Note saltate (vuote):      {self.stats['skipped_empty']}")
        self.logger.print_raw(f"   • Chiamate API effettuate:   {self.stats['api_calls']}")
        self.logger.print_raw(f"   • Tempo totale:              {minutes}m {seconds}s")
        self.logger.print_raw("")

        # -----------------------------------------------------------------
        # DETTAGLIO NOTE SALTATE PER TESTO TROPPO LUNGO
        # -----------------------------------------------------------------
        if self.skipped_notes:
            self.logger.print_raw("⚠️  NOTE SALTATE (TESTO TROPPO LUNGO):")
            self.logger.print_raw("-" * 60)
            for note in self.skipped_notes:
                title_display = note['title'][:40] + "..." if len(note['title']) > 40 else note['title']
                self.logger.print_raw(f"   • ID: {note['id']}")
                self.logger.print_raw(f"     Titolo: {title_display}")
                self.logger.print_raw(f"     Lunghezza: {note['text_length']} caratteri (max: {MAX_TEXT_LENGTH})")
                self.logger.print_raw("")
            self.logger.print_raw("-" * 60)
            self.logger.print_raw(f"   💡 Suggerimento: Considera di ridurre la trascrizione di queste note")
            self.logger.print_raw(f"      o di aumentare MAX_TEXT_LENGTH nello script.")
            self.logger.print_raw("")

        # -----------------------------------------------------------------
        # DETTAGLIO NOTE CON ERRORI
        # -----------------------------------------------------------------
        if self.error_notes:
            self.logger.print_raw("❌ NOTE CON ERRORI:")
            self.logger.print_raw("-" * 60)
            for note in self.error_notes:
                title_display = note['title'][:40] + "..." if len(note['title']) > 40 else note['title']
                self.logger.print_raw(f"   • ID: {note['id']}")
                self.logger.print_raw(f"     Titolo: {title_display}")
                self.logger.print_raw(f"     Errore: {note['error']}")
                self.logger.print_raw("")
            self.logger.print_raw("-" * 60)
            self.logger.print_raw("")

        # -----------------------------------------------------------------
        # FILE DI LOG
        # -----------------------------------------------------------------
        self.logger.print_raw(f"📁 Log salvato in: {self.logger.get_log_file_path()}")
        self.logger.print_raw("")

        # -----------------------------------------------------------------
        # MESSAGGIO FINALE
        # -----------------------------------------------------------------
        if self.stats['processed'] == self.stats['total_found']:
            self.logger.print_raw("✅ COMPLETATO: Tutte le note sono state processate con successo!")
        elif self.stats['processed'] > 0:
            remaining = self.stats['total_found'] - self.stats['processed']
            self.logger.print_raw(f"⚠️  PARZIALMENTE COMPLETATO: {remaining} note non processate.")
            self.logger.print_raw("   Rilancia lo script per riprovare le note fallite.")
        else:
            self.logger.print_raw("❌ NESSUNA NOTA PROCESSATA. Verifica gli errori sopra.")

        self.logger.print_raw("")
        self.logger.print_raw("=" * 70)
        self.logger.print_raw("")


# =============================================================================
# FUNZIONI HELPER
# =============================================================================

def prompt_provider_selection() -> EmbeddingProvider:
    """
    Mostra un menu interattivo per selezionare il provider di embedding.

    Viene chiamata quando l'utente non specifica --provider da riga di comando.

    Returns:
        EmbeddingProvider selezionato dall'utente
    """
    print("\n" + "=" * 50)
    print("  SELEZIONE PROVIDER EMBEDDING")
    print("=" * 50)
    print()
    print("  Quale provider vuoi utilizzare per generare gli embedding?")
    print()
    print("  [1] OpenAI  - text-embedding-3-small")
    print("  [2] Gemini  - gemini-embedding-001 (con batch processing)")
    print()

    while True:
        try:
            choice = input("  Inserisci la tua scelta (1 o 2): ").strip()

            if choice == "1":
                print()
                return EmbeddingProvider.OPENAI
            elif choice == "2":
                print()
                return EmbeddingProvider.GEMINI
            else:
                print("  ⚠️  Scelta non valida. Inserisci 1 o 2.")

        except KeyboardInterrupt:
            print("\n\n⚠️  Operazione annullata dall'utente.")
            sys.exit(0)


# =============================================================================
# FUNZIONE MAIN
# =============================================================================

def main():
    """
    Punto di ingresso dello script.

    Gestisce il parsing degli argomenti da riga di comando,
    la selezione del provider, e avvia il processore.
    """
    # -----------------------------------------------------------------
    # CONFIGURAZIONE PARSER ARGOMENTI
    # -----------------------------------------------------------------
    parser = argparse.ArgumentParser(
        description="Genera embedding vettoriali per le note vocali su Supabase.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Esempi di utilizzo:
  python process_embeddings.py                    # Menu interattivo per scegliere provider
  python process_embeddings.py --provider openai  # Usa OpenAI direttamente
  python process_embeddings.py --provider gemini  # Usa Gemini con batch processing
  python process_embeddings.py --dry-run          # Simula senza modificare il DB

Provider disponibili:
  openai  - OpenAI text-embedding-3-small (chiamate singole)
  gemini  - Google Gemini gemini-embedding-001 (batch processing ottimizzato)

Configurazione:
  Assicurati di configurare il file .env con le seguenti variabili:
  - SUPABASE_URL: URL del progetto Supabase
  - SUPABASE_KEY: Chiave API service_role di Supabase
  - OPENAI_API_KEY: Chiave API di OpenAI (se usi --provider openai)
  - GEMINI_API_KEY: Chiave API di Google Gemini (se usi --provider gemini)

Log:
  I log vengono salvati nella cartella 'logs/' con timestamp nel nome file.
        """
    )

    # Argomento --provider per scegliere il provider da riga di comando
    parser.add_argument(
        "--provider",
        type=str,
        choices=["openai", "gemini"],
        help="Provider per generare embedding: 'openai' o 'gemini'. Se omesso, verrà mostrato un menu interattivo."
    )

    # Argomento --dry-run per test senza modifiche al database
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula l'esecuzione senza scrivere sul database"
    )

    # -----------------------------------------------------------------
    # PARSING DEGLI ARGOMENTI
    # -----------------------------------------------------------------
    args = parser.parse_args()

    try:
        # -----------------------------------------------------------------
        # SELEZIONE DEL PROVIDER
        # -----------------------------------------------------------------
        if args.provider:
            # Provider specificato da riga di comando
            if args.provider == "openai":
                provider = EmbeddingProvider.OPENAI
            else:
                provider = EmbeddingProvider.GEMINI
        else:
            # Nessun provider specificato: mostra menu interattivo
            provider = prompt_provider_selection()

        # -----------------------------------------------------------------
        # CREAZIONE E AVVIO DEL PROCESSORE
        # -----------------------------------------------------------------
        processor = EmbeddingProcessor(
            provider=provider,
            dry_run=args.dry_run
        )
        processor.process()

    except KeyboardInterrupt:
        # Gestisce l'interruzione manuale (Ctrl+C)
        print("\n\n⚠️  Processo interrotto dall'utente.")
        sys.exit(0)

    except Exception as e:
        # Gestisce errori imprevisti non catturati altrove
        print(f"\n\n❌ Errore critico: {str(e)}")
        sys.exit(1)


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    main()
