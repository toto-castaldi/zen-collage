# ZEN Collage

Piccola web app **statica** (nessun build, nessun backend) per comporre un collage della
parola **ZEN** usando le foto di persone che a terra formano le lettere **Z**, **E**, **N**.

Per ogni lettera scegli la foto che preferisci, regola **posizione, zoom e rotazione**
dentro un ritaglio circolare, scegli lo **sfondo** (colore o trasparente) e premi
**Download** per ottenere un'unica immagine con i tre cerchi affiancati.

L'app è pensata per l'uso **in orizzontale**: su smartphone in verticale appare l'invito
a ruotare il telefono.

## Struttura

```
index.html      pagina + markup
styles.css      stile / layout landscape
app.js          logica (canvas, interazioni, download)
manifest.js     elenco delle foto per lettera
lettere/Z       foto della lettera Z
lettere/E       foto della lettera E
lettere/N       foto della lettera N
```

## Uso in locale

Per far funzionare anche il **Download**, apri l'app tramite un server HTTP (aprendola
con doppio clic come `file://` alcuni browser bloccano l'esportazione del canvas):

```bash
cd zen-collage
python3 -m http.server 8000
```

Poi apri <http://localhost:8000/>.

## Pubblicazione su GitHub Pages

1. Esegui il commit e il push del repo su GitHub.
2. Vai su **Settings → Pages**.
3. In *Build and deployment* scegli **Deploy from a branch**, branch **`main`**, cartella **`/ (root)`**, e salva.
4. Dopo qualche minuto l'app sarà su `https://<tuo-utente>.github.io/zen-collage/`.

## Spostare foto tra le lettere

Z e N sono pose simili: se una foto è nella cartella sbagliata, spostala a mano nella
cartella corretta dentro `lettere/` e **aggiorna gli elenchi in `manifest.js`** di
conseguenza.
