# MangaTrack

App React (Vite) per gestire la propria libreria manga, con ricerca AniList e funzioni social.

## Setup

```bash
npm install
```

Copia `.env.example` in `.env` e inserisci i valori del tuo progetto Supabase:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Il file `.env` è ignorato da Git: le credenziali restano solo in locale. Nel client va
usata esclusivamente la chiave **anon** (pubblica, protetta dalle policy RLS).
Non inserire mai una chiave `service_role` in questo progetto.

## Comandi

```bash
npm run dev      # server di sviluppo (porta 3000)
npm run build    # build di produzione in dist/
npm run preview  # anteprima della build
```

In sviluppo `?preview=app` avvia la shell con dati demo (nessuna chiamata reale a Supabase),
mentre `&lang=en` forza l'interfaccia in inglese.

## Deploy su Vercel

1. Importa il repository GitHub su Vercel (preset **Vite**).
2. Build command: `npm run build` — Output directory: `dist`.
3. In **Settings → Environment Variables** aggiungi, per Production e Preview:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Fai un nuovo deploy: le variabili `VITE_*` vengono lette e incorporate al momento
   della build, quindi una modifica richiede un redeploy.

La build fallisce volutamente con un messaggio esplicito se le due variabili mancano,
così non viene pubblicata un'app senza backend.

Infine, nel dashboard Supabase vai in **Authentication → URL Configuration** e imposta:

- **Site URL**: `https://<il-tuo-progetto>.vercel.app`
- **Redirect URLs**: aggiungi lo stesso dominio (ed eventuale dominio personalizzato).

Serve per i link di conferma email e recupero password: senza questa configurazione i
link nelle email puntano al vecchio indirizzo (spesso `localhost`).
