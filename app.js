/* ZEN Collage — logica vanilla, nessuna dipendenza.
   Un solo canvas: la stessa funzione disegna anteprima ed export (WYSIWYG). */
(function () {
  "use strict";

  const LETTERS = ["Z", "E", "N"];
  const DATA = window.ZEN_LETTERS;

  // Proporzioni del layout, espresse in unità di D (diametro di un cerchio).
  const PAD = 0.10;   // margine esterno
  const GAP = 0.10;   // spazio fra cerchi
  const SPAN_W = 2 * PAD + 3 + 2 * GAP; // = 3.4  -> larghezza totale / D
  const SPAN_H = 2 * PAD + 1;           // = 1.2  -> altezza totale / D

  const EXPORT_D = 1024; // risoluzione del cerchio nell'immagine scaricata

  // Stato per lettera. offsetX/offsetY sono frazioni di D (indipendenti dalla risoluzione).
  const state = {};
  for (const L of LETTERS) {
    state[L] = { file: null, img: null, scale: 1, rotation: 0, offsetX: 0, offsetY: 0 };
  }

  let active = "Z";
  let bgColor = "#ffffff";
  let bgTransparent = false;

  const imgCache = new Map();

  // --- DOM ---
  const canvas = document.getElementById("preview");
  const ctx = canvas.getContext("2d");
  const thumbsEl = document.getElementById("thumbs");
  const tabsEl = document.getElementById("letter-tabs");
  const zoomEl = document.getElementById("zoom");
  const rotEl = document.getElementById("rotation");
  const resetBtn = document.getElementById("reset-btn");
  const bgColorEl = document.getElementById("bg-color");
  const bgTranspEl = document.getElementById("bg-transparent");
  const downloadBtn = document.getElementById("download-btn");
  const rotateOverlay = document.getElementById("rotate-overlay");

  // Layout corrente dell'anteprima (in unità CSS px), per l'hit-testing dei puntatori.
  let layout = null;

  // ---------- Caricamento immagini ----------
  function loadImage(path) {
    if (imgCache.has(path)) return imgCache.get(path);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Impossibile caricare " + path));
      img.src = path;
    });
    imgCache.set(path, p);
    return p;
  }

  function pathFor(letter, file) {
    return DATA[letter].dir + "/" + file;
  }

  async function selectPhoto(letter, file, resetTransform) {
    const st = state[letter];
    st.file = file;
    if (resetTransform) {
      st.scale = 1; st.rotation = 0; st.offsetX = 0; st.offsetY = 0;
    }
    try {
      st.img = await loadImage(pathFor(letter, file));
    } catch (e) {
      st.img = null;
      console.error(e);
    }
    if (letter === active) syncControls();
    renderPreview();
    if (letter === active) markSelectedThumb();
  }

  // ---------- Disegno ----------
  // Calcola centri e raggio dato D.
  function geometry(D) {
    const pad = PAD * D, gap = GAP * D, r = D / 2;
    const W = SPAN_W * D, H = SPAN_H * D;
    const cy = H / 2;
    const centers = LETTERS.map((_, i) => ({ x: pad + r + i * (D + gap), y: cy }));
    return { pad, gap, r, W, H, centers };
  }

  // Disegna il collage. guides=true mostra anelli/placeholder solo in anteprima.
  function drawCollage(c, D, guides) {
    const g = geometry(D);
    c.clearRect(0, 0, g.W, g.H);
    if (!bgTransparent) {
      c.fillStyle = bgColor;
      c.fillRect(0, 0, g.W, g.H);
    }

    LETTERS.forEach((L, i) => {
      const st = state[L];
      const ctr = g.centers[i];

      c.save();
      c.beginPath();
      c.arc(ctr.x, ctr.y, g.r, 0, Math.PI * 2);
      c.closePath();
      c.clip();

      if (st.img) {
        const iw = st.img.naturalWidth || st.img.width;
        const ih = st.img.naturalHeight || st.img.height;
        const cover = Math.max(D / iw, D / ih);
        const s = cover * st.scale;
        c.translate(ctr.x + st.offsetX * D, ctr.y + st.offsetY * D);
        c.rotate(st.rotation);
        c.scale(s, s);
        c.drawImage(st.img, -iw / 2, -ih / 2);
      } else if (guides) {
        c.fillStyle = "#334155";
        c.fillRect(ctr.x - g.r, ctr.y - g.r, D, D);
        c.fillStyle = "#94a3b8";
        c.font = "bold " + (D * 0.4) + "px system-ui, sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(L, ctr.x, ctr.y);
      }
      c.restore();

      if (guides) {
        c.beginPath();
        c.arc(ctr.x, ctr.y, g.r, 0, Math.PI * 2);
        c.lineWidth = Math.max(2, D * 0.012);
        c.strokeStyle = L === active ? "#38bdf8" : "rgba(148,163,184,.5)";
        c.stroke();
      }
    });
  }

  function renderPreview() {
    // Dimensiona il canvas in base allo spazio disponibile mantenendo le proporzioni.
    const stage = canvas.parentElement;
    const availW = stage.clientWidth - 12;
    const availH = stage.clientHeight - 28; // lascia spazio per il suggerimento
    let D = availW / SPAN_W;
    if (D * SPAN_H > availH) D = availH / SPAN_H;
    D = Math.max(40, D);

    const g = geometry(D);
    // Cap della risoluzione interna: evita allocazioni enormi (e freeze del
    // renderer) con DPR alti o stati di zoom anomali, soprattutto su mobile.
    const MAX_DIM = 4096;
    let dpr = Math.min(window.devicePixelRatio || 1, 3);
    dpr = Math.min(dpr, MAX_DIM / g.W, MAX_DIM / g.H);
    canvas.style.width = g.W + "px";
    canvas.style.height = g.H + "px";
    canvas.width = Math.round(g.W * dpr);
    canvas.height = Math.round(g.H * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCollage(ctx, D, true);

    layout = { D, ...g };
  }

  // ---------- Hit testing ----------
  function pointerToLogical(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (layout.W / rect.width);
    const y = (e.clientY - rect.top) * (layout.H / rect.height);
    return { x, y };
  }

  function circleAt(pt) {
    for (let i = 0; i < LETTERS.length; i++) {
      const ctr = layout.centers[i];
      const dx = pt.x - ctr.x, dy = pt.y - ctr.y;
      if (dx * dx + dy * dy <= layout.r * layout.r) return LETTERS[i];
    }
    return null;
  }

  // ---------- Interazioni puntatore (mouse + touch) ----------
  const pointers = new Map(); // id -> {x,y}
  let dragging = false;
  let lastSingle = null;
  let pinch = null; // {dist, angle, scale, rotation}

  function pointerDist() {
    const pts = [...pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }
  function pointerAngle() {
    const pts = [...pointers.values()];
    return Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const pt = pointerToLogical(e);
    pointers.set(e.pointerId, pt);

    const hit = circleAt(pt);
    if (hit) setActive(hit);

    if (pointers.size === 1) {
      dragging = !!hit;
      lastSingle = pt;
    } else if (pointers.size === 2) {
      dragging = false;
      const st = state[active];
      pinch = { dist: pointerDist(), angle: pointerAngle(), scale: st.scale, rotation: st.rotation };
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const pt = pointerToLogical(e);
    pointers.set(e.pointerId, pt);

    if (pointers.size >= 2 && pinch) {
      const st = state[active];
      const ratio = pointerDist() / pinch.dist;
      st.scale = clamp(pinch.scale * ratio, 1, 4);
      st.rotation = pinch.rotation + (pointerAngle() - pinch.angle);
      syncControls();
      renderPreview();
      return;
    }

    if (dragging && lastSingle) {
      const st = state[active];
      st.offsetX += (pt.x - lastSingle.x) / layout.D;
      st.offsetY += (pt.y - lastSingle.y) / layout.D;
      lastSingle = pt;
      renderPreview();
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) { dragging = false; lastSingle = null; }
    else if (pointers.size === 1) lastSingle = [...pointers.values()][0];
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const pt = pointerToLogical(e);
    const target = circleAt(pt) || active;
    setActive(target);
    const st = state[target];
    const factor = Math.exp(-e.deltaY * 0.0015);
    st.scale = clamp(st.scale * factor, 1, 4);
    syncControls();
    renderPreview();
  }, { passive: false });

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // ---------- Controlli UI ----------
  function setActive(letter) {
    if (active === letter) return;
    active = letter;
    [...tabsEl.children].forEach((b) =>
      b.classList.toggle("active", b.dataset.letter === letter)
    );
    buildThumbs();
    syncControls();
    renderPreview();
  }

  function syncControls() {
    const st = state[active];
    zoomEl.value = st.scale;
    rotEl.value = Math.round((st.rotation * 180) / Math.PI);
  }

  tabsEl.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-letter]");
    if (b) setActive(b.dataset.letter);
  });

  zoomEl.addEventListener("input", () => {
    state[active].scale = parseFloat(zoomEl.value);
    renderPreview();
  });
  rotEl.addEventListener("input", () => {
    state[active].rotation = (parseFloat(rotEl.value) * Math.PI) / 180;
    renderPreview();
  });
  resetBtn.addEventListener("click", () => {
    const st = state[active];
    st.scale = 1; st.rotation = 0; st.offsetX = 0; st.offsetY = 0;
    syncControls();
    renderPreview();
  });

  bgColorEl.addEventListener("input", () => {
    bgColor = bgColorEl.value;
    bgTransparent = false;
    bgTranspEl.checked = false;
    renderPreview();
  });
  bgTranspEl.addEventListener("change", () => {
    bgTransparent = bgTranspEl.checked;
    renderPreview();
  });

  // ---------- Thumbnails ----------
  function buildThumbs() {
    thumbsEl.innerHTML = "";
    DATA[active].files.forEach((file) => {
      const img = document.createElement("img");
      img.src = pathFor(active, file);
      img.alt = active + " " + file;
      img.loading = "lazy";
      img.dataset.file = file;
      img.addEventListener("click", () => selectPhoto(active, file, true));
      thumbsEl.appendChild(img);
    });
    markSelectedThumb();
  }

  function markSelectedThumb() {
    const cur = state[active].file;
    [...thumbsEl.children].forEach((img) =>
      img.classList.toggle("selected", img.dataset.file === cur)
    );
  }

  // ---------- Download ----------
  downloadBtn.addEventListener("click", () => {
    const g = geometry(EXPORT_D);
    const out = document.createElement("canvas");
    out.width = Math.round(g.W);
    out.height = Math.round(g.H);
    const octx = out.getContext("2d");
    drawCollage(octx, EXPORT_D, false);

    out.toBlob((blob) => {
      if (!blob) {
        alert(
          "Download non riuscito: il browser blocca l'esportazione delle immagini caricate da file locale.\n" +
          "Avvia un piccolo server (es. \"python3 -m http.server\") e apri l'app via http://localhost."
        );
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zen.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  });

  // ---------- Orientamento ----------
  function checkOrientation() {
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const portrait = window.innerHeight > window.innerWidth;
    rotateOverlay.hidden = !(isTouch && portrait);
  }

  let resizeRaf = null;
  function onResize() {
    checkOrientation();
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(renderPreview);
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  // ---------- Avvio ----------
  function init() {
    checkOrientation();
    buildThumbs();
    syncControls();
    renderPreview();
    // Carica la prima foto di ogni lettera.
    LETTERS.forEach((L) => {
      const first = DATA[L].files[0];
      if (first) selectPhoto(L, first, true);
    });
  }

  init();
})();
