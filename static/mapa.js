/* ============================================================
   gonogo — mapa de puntos de El Salvador
   Cada punto pertenece a un departamento (ver sv-puntos.js).
   No usa teselas ni librerías: es un SVG, se imprime bien y
   funciona sin conexión.

   Uso:
     const mapa = GonogoMapa.crear(elemento, { etiquetas: true });
     mapa.pintar([{ departamento, personas, porcentaje }, ...]);
   ============================================================ */

(function () {
  const NS = "http://www.w3.org/2000/svg";
  const PASO = 10;      // unidades del SVG por celda
  const RADIO = 2.7;

  function crear(contenedor, opciones) {
    const datos = window.SV_PUNTOS;
    const op = Object.assign({ etiquetas: false, ambiente: false, interactivo: true }, opciones);
    if (!datos || !contenedor) return { pintar() {}, limpiar() {} };

    const ancho = datos.cols * (PASO / 2) + PASO;
    const alto = datos.filas * PASO;

    contenedor.classList.add("mapa-sv");
    if (op.ambiente) contenedor.classList.add("ambiente");
    contenedor.innerHTML = "";

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Mapa de El Salvador dibujado con puntos");

    const circulos = [];
    const frag = document.createDocumentFragment();
    datos.puntos.forEach(([x, y, d]) => {
      const c = document.createElementNS(NS, "circle");
      const cx = x * (PASO / 2) + PASO / 2;
      const cy = y * PASO + PASO / 2;
      c.setAttribute("cx", cx);
      c.setAttribute("cy", cy);
      c.setAttribute("r", RADIO);
      c.dataset.d = d;
      // El encendido barre de occidente a oriente
      c.style.transitionDelay = ((cx / ancho) * 0.9).toFixed(2) + "s";
      if (op.ambiente && Math.random() < 0.085) {
        c.classList.add("vivo");
        c.style.animationDelay = (Math.random() * -4.5).toFixed(2) + "s";
      }
      circulos.push({ el: c, cx, cy, d });
      frag.appendChild(c);
    });
    svg.appendChild(frag);
    contenedor.appendChild(svg);

    const capaEtiquetas = document.createElement("div");
    contenedor.appendChild(capaEtiquetas);

    const globo = document.createElement("div");
    globo.className = "mapa-globo";
    contenedor.appendChild(globo);

    let porDepto = null;

    function aSvg(evento) {
      const caja = svg.getBoundingClientRect();
      return {
        x: ((evento.clientX - caja.left) / caja.width) * ancho,
        y: ((evento.clientY - caja.top) / caja.height) * alto,
        caja,
      };
    }

    // ---- Modo ambiente: los puntos cercanos al cursor se encienden ----
    if (op.ambiente && window.matchMedia("(hover: hover)").matches) {
      const zona = op.zona || contenedor;
      let pendiente = false, ultimo = null, encendidos = [];
      const alcance = 34;
      zona.addEventListener("pointermove", (e) => {
        ultimo = e;
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(() => {
          pendiente = false;
          const p = aSvg(ultimo);
          encendidos.forEach((c) => c.el.classList.remove("foco"));
          encendidos = [];
          if (p.x < -alcance || p.y < -alcance || p.x > ancho + alcance || p.y > alto + alcance) return;
          for (const c of circulos) {
            const dx = c.cx - p.x, dy = c.cy - p.y;
            if (dx * dx + dy * dy < alcance * alcance) {
              c.el.classList.add("foco");
              encendidos.push(c);
            }
          }
        });
      });
      zona.addEventListener("pointerleave", () => {
        encendidos.forEach((c) => c.el.classList.remove("foco"));
        encendidos = [];
      });
    }

    // ---- Con datos: al pasar por un departamento se muestra su conteo ----
    if (op.interactivo && !op.ambiente) {
      svg.addEventListener("pointermove", (e) => {
        if (!porDepto) return;
        const p = aSvg(e);
        let mejor = null, dist = 14 * 14;
        for (const c of circulos) {
          const dx = c.cx - p.x, dy = c.cy - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < dist) { dist = d2; mejor = c; }
        }
        if (!mejor) { globo.classList.remove("visible"); return; }
        const nombre = datos.deptos[mejor.d];
        const fila = porDepto[nombre];
        const cont = contenedor.getBoundingClientRect();
        globo.innerHTML = fila
          ? `<b>${nombre}</b><br>${formato(fila.personas)} personas, ${(fila.porcentaje * 100).toFixed(1)}%`
          : `<b>${nombre}</b><br>sin personas del perfil`;
        globo.style.left = e.clientX - cont.left + "px";
        globo.style.top = e.clientY - cont.top + "px";
        globo.classList.add("visible");
      });
      svg.addEventListener("pointerleave", () => globo.classList.remove("visible"));
    }

    function formato(n) {
      return new Intl.NumberFormat("es-SV").format(n);
    }

    function pintar(lista) {
      porDepto = {};
      (lista || []).forEach((f) => { porDepto[f.departamento] = f; });
      const max = Math.max(1, ...(lista || []).map((f) => f.personas));

      contenedor.classList.add("con-datos");
      circulos.forEach((c) => {
        const fila = porDepto[datos.deptos[c.d]];
        if (!fila || !fila.personas) {
          c.el.classList.add("apagado");
          c.el.style.removeProperty("--o");
          return;
        }
        c.el.classList.remove("apagado");
        const t = Math.sqrt(fila.personas / max);
        c.el.style.setProperty("--o", (0.16 + 0.84 * t).toFixed(3));
      });

      capaEtiquetas.innerHTML = "";
      if (op.etiquetas) {
        // Se etiquetan los departamentos con más personas, saltando los que
        // quedarían encimados sobre una etiqueta ya puesta.
        const cupo = op.etiquetas === true ? 5 : op.etiquetas;
        const puestas = [];
        [...(lista || [])]
          .filter((f) => f.personas > 0)
          .sort((a, b) => b.personas - a.personas)
          .forEach((f) => {
            if (puestas.length >= cupo) return;
            const i = datos.deptos.indexOf(f.departamento);
            if (i < 0) return;
            const [x, y] = datos.centros[i];
            if (puestas.some(([px, py]) => Math.abs(px - x) < 26 && Math.abs(py - y) < 6)) return;
            puestas.push([x, y]);
            const et = document.createElement("div");
            et.className = "mapa-etiqueta";
            et.style.left = (((x * (PASO / 2) + PASO / 2) / ancho) * 100).toFixed(2) + "%";
            et.style.top = (((y * PASO + PASO / 2) / alto) * 100).toFixed(2) + "%";
            et.innerHTML = `<b>${(f.porcentaje * 100).toFixed(0)}%</b>${f.departamento}`;
            capaEtiquetas.appendChild(et);
          });
      }
    }

    function limpiar() {
      porDepto = null;
      contenedor.classList.remove("con-datos");
      capaEtiquetas.innerHTML = "";
      circulos.forEach((c) => { c.el.classList.remove("apagado"); c.el.style.removeProperty("--o"); });
    }

    return { pintar, limpiar };
  }

  window.GonogoMapa = { crear };
})();
