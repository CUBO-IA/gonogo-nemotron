/* ============================================================
   gonogo — fondo de resplandor en caracteres
   Un arco de luz dibujado con letras, que se mezclan bajo el
   cursor. Canvas 2D, sin librerías. Las letras salen del nombre:
   g, o, n.

   Uso:
     GonogoAscii.crear(elemento);            // elemento con position relativa
   ============================================================ */

(function () {
  // De menos a más tinta: las zonas brillantes usan los últimos.
  const GLIFOS = " .:-=+ongOGN0";

  // Rampa de color de la marca: azul hondo → azul → cian → casi blanco
  const RAMPA = [
    [0.0, 5, 16, 124],
    [0.38, 10, 40, 218],
    [0.72, 37, 125, 224],
    [0.9, 69, 215, 229],
    [1.0, 232, 246, 255],
  ];
  const NIVELES = 14;

  function colorEn(t) {
    t = Math.min(1, Math.max(0, t));
    for (let i = 1; i < RAMPA.length; i++) {
      if (t <= RAMPA[i][0]) {
        const a = RAMPA[i - 1], b = RAMPA[i];
        const k = (t - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      }
    }
    return RAMPA[RAMPA.length - 1].slice(1);
  }

  // Número pseudoaleatorio estable por celda
  function azar(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function crear(contenedor, opciones) {
    if (!contenedor) return null;
    const op = Object.assign({
      celda: 18,          // alto de cada carácter, en px
      densidad: 0.82,     // parte de las celdas que muestran carácter
      horizonte: 0.3,     // altura del arco, como fracción del alto (0 arriba, 1 abajo)
      radio: 2.6,         // radio del arco, en altos de pantalla
      alcance: 0.3,       // qué tan lejos llega la luz sobre el arco
      radioCursor: 0.11,  // zona que se mezcla bajo el cursor, relativa al alto
      ancla: null,        // elemento que debe quedar debajo del arco, sobre lo oscuro
    }, opciones);

    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const lienzo = document.createElement("canvas");
    lienzo.className = "fondo-ascii";
    lienzo.setAttribute("aria-hidden", "true");
    contenedor.prepend(lienzo);
    const ctx = lienzo.getContext("2d");

    // Capa pequeña para el resplandor suave (una "celda" = un píxel, luego se estira)
    const capa = document.createElement("canvas");
    const cctx = capa.getContext("2d");

    let ancho = 0, alto = 0, dpr = 1, cols = 0, filas = 0, cw = 0, ch = 0;
    let semilla = null, mezclaHasta = null, imagen = null;
    const colores = [];
    for (let i = 0; i < NIVELES; i++) {
      const [r, g, b] = colorEn(0.2 + (0.8 * i) / (NIVELES - 1));
      colores.push(`rgb(${r | 0},${g | 0},${b | 0})`);
    }

    function medir() {
      const caja = contenedor.getBoundingClientRect();
      if (!caja.width || !caja.height) return false;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      ancho = caja.width; alto = caja.height;
      lienzo.width = Math.round(ancho * dpr);
      lienzo.height = Math.round(alto * dpr);
      ch = op.celda;
      cw = Math.round(ch * 0.62);
      cols = Math.ceil(ancho / cw);
      filas = Math.ceil(alto / ch);
      capa.width = cols; capa.height = filas;
      imagen = cctx.createImageData(cols, filas);
      semilla = new Float32Array(cols * filas);
      mezclaHasta = new Float32Array(cols * filas);
      for (let i = 0; i < semilla.length; i++) semilla[i] = azar(i + 1);

      // El arco se coloca justo encima del ancla (el título), en cualquier pantalla,
      // para que el texto siempre quede sobre la zona oscura.
      if (op.ancla) {
        const tope = (op.ancla.getBoundingClientRect().top - caja.top) / alto;
        const x = ancho / alto / 2;
        const caida = op.radio - Math.sqrt(Math.max(0, op.radio * op.radio - x * x));
        op.horizonte = Math.min(0.6, Math.max(0.07, tope - 0.035 - caida));
      }
      return true;
    }

    // Intensidad de luz en un punto. x va de -aspecto/2 a aspecto/2, y de 0 (arriba) a 1 (abajo).
    function luz(x, y, t) {
      const cx = Math.sin(t * 0.11) * 0.05;
      const cy = op.horizonte + op.radio;
      const d = Math.hypot(x - cx, y - cy) - op.radio;      // > 0 por encima del arco
      const borde = d >= 0
        ? Math.exp(-d / op.alcance)                          // la luz se apaga hacia arriba
        : Math.exp(d / 0.03);                                // y cae rápido dentro del arco
      const lateral = Math.exp(-(x * x) / 1.15);             // más brillante al centro
      const deriva = 0.8 + 0.2 * Math.sin(x * 2.7 + t * 0.32) * Math.cos(y * 5.1 - t * 0.21)
        + 0.1 * Math.sin(x * 6.3 - t * 0.5);
      return Math.max(0, Math.min(1, borde * (0.3 + 0.7 * lateral) * deriva));
    }

    let puntero = null;
    const ondas = [];

    function cuadro(ahora) {
      const t = ahora / 1000;
      const entrada = reducido ? 1 : Math.min(1, (ahora - inicio) / 1600);
      const aspecto = ancho / alto;
      const datos = imagen.data;
      const visibles = [];
      for (let n = 0; n < NIVELES; n++) visibles.push([]);

      const tramo = Math.floor(t * 5);
      const rc = op.radioCursor * alto;

      for (let f = 0; f < filas; f++) {
        const y = (f + 0.5) / filas;
        for (let c = 0; c < cols; c++) {
          const i = f * cols + c;
          const x = ((c + 0.5) / cols - 0.5) * aspecto;
          const v = luz(x, y, reducido ? 0 : t) * entrada;

          // Resplandor suave de fondo
          const [r, g, b] = colorEn(v * 0.95);
          const p = i * 4;
          datos[p] = r; datos[p + 1] = g; datos[p + 2] = b;
          datos[p + 3] = Math.min(255, Math.pow(v, 1.2) * 290);

          if (v < 0.05) continue;

          // ¿Esta celda está bajo el cursor o en una onda de clic?
          const px = (c + 0.5) * cw, py = (f + 0.5) * ch;
          if (puntero) {
            const dx = px - puntero.x, dy = py - puntero.y;
            if (dx * dx + dy * dy < rc * rc) mezclaHasta[i] = ahora + 420;
          }
          for (const o of ondas) {
            const dist = Math.hypot(px - o.x, py - o.y);
            if (Math.abs(dist - o.r) < ch * 1.6) mezclaHasta[i] = ahora + 260;
          }
          const mezclada = mezclaHasta[i] > ahora;

          // Las zonas brillantes se llenan primero
          if (!mezclada && semilla[i] > op.densidad * (0.35 + v * 0.9)) continue;

          let g2 = Math.floor(Math.pow(v, 0.75) * (GLIFOS.length - 1));
          if (mezclada) {
            g2 = 1 + Math.floor(Math.random() * (GLIFOS.length - 1));
          } else if (!reducido && azar(i * 7.3 + tramo) < 0.06) {
            g2 += azar(i + tramo * 3.1) < 0.5 ? -1 : 1;     // parpadeo ocasional
          }
          g2 = Math.max(1, Math.min(GLIFOS.length - 1, g2));

          const nivel = Math.min(NIVELES - 1, Math.floor((mezclada ? Math.min(1, v + 0.45) : v) * NIVELES));
          visibles[nivel].push(GLIFOS[g2], px, py);
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, ancho, alto);
      cctx.putImageData(imagen, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = 0.95;
      ctx.drawImage(capa, 0, 0, cols * cw, filas * ch);

      ctx.font = `500 ${Math.round(ch * 0.74)}px "DM Mono", ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let n = 0; n < NIVELES; n++) {
        const lista = visibles[n];
        if (!lista.length) continue;
        ctx.globalAlpha = (0.38 + 0.6 * (n / (NIVELES - 1))) * entrada;
        ctx.fillStyle = colores[n];
        for (let k = 0; k < lista.length; k += 3) ctx.fillText(lista[k], lista[k + 1], lista[k + 2]);
      }
      ctx.globalAlpha = 1;

      for (let k = ondas.length - 1; k >= 0; k--) {
        ondas[k].r += ch * 0.9;
        if (ondas[k].r > Math.hypot(ancho, alto)) ondas.splice(k, 1);
      }
    }

    let inicio = performance.now();
    let ultimo = 0;
    function bucle(ahora) {
      requestAnimationFrame(bucle);
      if (!contenedor.offsetParent) return;                 // pantalla oculta: no se dibuja
      if (!cols && !medir()) return;
      if (ahora - ultimo < 40) return;                      // unos 25 cuadros por segundo
      ultimo = ahora;
      cuadro(ahora);
    }

    function redibujar() {
      if (!medir()) return;
      if (reducido) cuadro(performance.now());
    }

    if ("ResizeObserver" in window) new ResizeObserver(redibujar).observe(contenedor);
    else window.addEventListener("resize", redibujar);

    if (reducido) {
      redibujar();
    } else {
      contenedor.addEventListener("pointermove", (e) => {
        const caja = lienzo.getBoundingClientRect();
        puntero = { x: e.clientX - caja.left, y: e.clientY - caja.top };
      });
      contenedor.addEventListener("pointerleave", () => { puntero = null; });
      contenedor.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button, a, input, textarea, label")) return;
        const caja = lienzo.getBoundingClientRect();
        ondas.push({ x: e.clientX - caja.left, y: e.clientY - caja.top, r: 0 });
      });
      requestAnimationFrame(bucle);
    }

    return { reiniciar() { inicio = performance.now(); } };
  }

  window.GonogoAscii = { crear };
})();
