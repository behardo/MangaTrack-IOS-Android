# Demo — MangaTrack

Scaletta per la discussione del progetto. Obiettivo: **60–90 secondi**, con un piano B già pronto.

## Prima di entrare

- [ ] Account demo con **6–8 manga** in libreria, almeno 2 con copertina e progressi (es. Real a cap. 43).
- [ ] Un secondo account che segue il primo, con **2–3 attività** nel feed e, se possibile, un consiglio in attesa.
- [ ] Hard refresh di https://manga-track-ios.vercel.app e login già fatto.
- [ ] Finestra in formato telefono (DevTools → device toolbar, 390 × 844) oppure telefono reale.
- [ ] Titoli di riserva provati il giorno stesso: **Berserk**, **Real**, **Slam Dunk**.
- [ ] Video demo (23 s) dentro il PowerPoint come piano B.

## Scaletta (90 secondi)

1. **Home (10 s)** — "Questa è la home: riepilogo capitoli letti, manga in corso e continuazione della lettura."
2. **Ricerca (20 s)** — Cerca un titolo ("Berserk"), apri la scheda: mostra copertina, generi e **sinossi**. Aggiungi allo scaffale "Da leggere".
3. **Libreria (15 s)** — Filtra per stato, mostra la griglia con i progressi e il badge dello stato.
4. **Dettaglio (20 s)** — Apri un manga dalla libreria: mostra la sezione **Trama**, cambia il capitolo con `+`, metti il voto e salva.
5. **Social (20 s)** — Mostra il feed attività, apri un manga dal feed e usa **"+ In libreria"**. Poi apri **Consigli** e inviane uno a un amico.
6. **Chiusura (5 s)** — "Dati su Supabase con RLS, deploy automatico su Vercel, test con `npm test`."

## Piano B

- **API esterne lente o giù** (ricerca vuota): passa a un manga già in libreria e continua dal punto 3. Il resto dell'app non dipende da AniList.
- **Feed vuoto**: apri la tab **Seguiti** e poi la libreria di un amico; i dati dell'altro account restano visibili.
- **Rete assente in aula**: usa la versione locale con dati demo:
  ```bash
  npm run dev
  # poi apri http://localhost:3000/?preview=app
  ```
  In produzione `?preview=app` è disattivato: funziona solo in sviluppo.
- **Login o deploy rotto**: parti dal video nel PowerPoint e continua sulle slide; riprova l'app alla fine.

## Domande probabili

| Domanda | Risposta breve |
|---|---|
| Perché Supabase e non Express/Flask? | PostgreSQL, Auth con JWT, Storage e policy RLS pronti; il tempo è andato sul modello dati e sulla sicurezza, non sul CRUD ripetitivo. |
| Come sono protetti i dati? | RLS su tutte le tabelle: lettura pubblica solo dove serve (librerie, feed), scritture sempre legate a `auth.uid()`. |
| Perché non c'è un router? | L'app è una shell mobile a schede; lo stato `view` basta. Limite dichiarato: le viste non hanno un URL proprio. |
| Cosa succede se un'API esterna non risponde? | Timeout con `AbortController`, 3 tentativi su AniList, fallback su Kitsu; i totali hanno anche una funzione serverless con cache. |
| Ci sono test? | Sì: `npm test` con il runner di Node, su mapping AniList, lookup per titolo e handler `/api/totals`. |
| Come gestisci i dati mancanti? | Copertine e sinossi vengono recuperate on-demand da AniList; la copertina recuperata viene salvata nella riga di libreria. |
