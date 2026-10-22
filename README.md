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
