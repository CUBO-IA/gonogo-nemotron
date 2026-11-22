/* ============================================================
   gonogo — home
   Cortina de inicio, mapa del hero, manifiesto y demos.
   ============================================================ */

(function () {
  const raiz = document.documentElement;
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Cortina de inicio ----------
  const intro = document.getElementById("intro");
  if (intro && raiz.classList.contains("con-intro")) {
    const cuenta = document.getElementById("intro-cuenta");
    const TOTAL = 148000;
    const DURA = 2300;
    let cerrado = false;

    function cerrar() {
      if (cerrado) return;
      cerrado = true;
      try { sessionStorage.setItem("gonogo_intro", "1"); } catch (e) {}
      cuenta.textContent = TOTAL.toLocaleString("en-US");
      intro.classList.add("fuera");
      raiz.classList.remove("con-intro");
      raiz.classList.add("listo");
      intro.style.display = "flex";
      setTimeout(() => intro.remove(), 1100);
    }

    // Con temporizador y no solo con el siguiente cuadro, para que la frase
    // aparezca aunque la pestaña esté en segundo plano.
    setTimeout(() => intro.classList.add("entra"), 60);

    const inicio = performance.now();
    (function contar(ahora) {
      if (cerrado) return;
      const t = Math.min(1, (ahora - inicio) / DURA);
      const suave = 1 - Math.pow(1 - t, 3);
      cuenta.textContent = Math.round(TOTAL * suave).toLocaleString("en-US");
      if (t < 1) requestAnimationFrame(contar);
    })(inicio);

    // Se queda el tiempo suficiente para leerla. Quien quiera seguir antes
    // puede deslizar, hacer clic o tocar una tecla.
    const EXPOSICION = 7000;
    setTimeout(cerrar, EXPOSICION);
    intro.addEventListener("click", cerrar);
    window.addEventListener("keydown", cerrar, { once: true });
    setTimeout(() => {
      window.addEventListener("wheel", cerrar, { once: true, passive: true });
      window.addEventListener("touchmove", cerrar, { once: true, passive: true });
    }, 900);
  }

  // ---------- Barra: fondo al bajar ----------
  const barra = document.getElementById("barra");
  function alDesplazar() {
    barra.classList.toggle("con-fondo", window.scrollY > 40);
    actualizarManifiesto();
  }

  // ---------- Mapa del hero ----------
  const heroMapa = document.getElementById("hero-mapa");
  if (heroMapa && window.GonogoMapa) {
    GonogoMapa.crear(heroMapa, { ambiente: true, zona: document.getElementById("hero") });
  }

  // ---------- Manifiesto: las palabras se llenan al bajar ----------
  const manifiesto = document.getElementById("manifiesto");
  const textoM = document.getElementById("manifiesto-texto");
  let palabras = [];
  if (textoM && !reducido) {
    const partes = textoM.textContent.trim().split(/\s+/);
    textoM.innerHTML = partes.map((p) => `<span class="pal">${p}</span>`).join(" ");
    palabras = [...textoM.querySelectorAll(".pal")];
  }
  function actualizarManifiesto() {
    if (!palabras.length) return;
    const caja = manifiesto.getBoundingClientRect();
    const recorrido = caja.height - window.innerHeight;
    const t = Math.min(1, Math.max(0, (-caja.top + window.innerHeight * 0.15) / recorrido));
    const hasta = Math.round(t * palabras.length * 1.08);
    palabras.forEach((p, i) => p.classList.toggle("on", i < hasta));
  }

  let enCola = false;
  window.addEventListener("scroll", () => {
    if (enCola) return;
    enCola = true;
    requestAnimationFrame(() => { enCola = false; alDesplazar(); });
  }, { passive: true });
  alDesplazar();

  // ---------- Demos de "Cómo funciona" ----------
  function alVer(el, fn) {
    if (!el) return;
    if (!("IntersectionObserver" in window)) { fn(); return; }
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) { obs.disconnect(); fn(); }
    }, { threshold: 0.4 });
    obs.observe(el);
  }

  // Paso 1: la idea se escribe sola
  const escrito = document.getElementById("demo-escrito");
  if (escrito) {
    const texto = escrito.dataset.texto;
    if (reducido) {
      escrito.textContent = texto;
    } else {
      alVer(escrito, () => {
        let i = 0;
        (function teclear() {
          escrito.textContent = texto.slice(0, i++);
          if (i <= texto.length) setTimeout(teclear, 22 + Math.random() * 30);
        })();
      });
    }
  }

  // Paso 3: el mapa se enciende por departamento (cifras de ejemplo)
  const demoMapa = document.getElementById("demo-mapa");
  if (demoMapa && window.GonogoMapa) {
    const mapa = GonogoMapa.crear(demoMapa, { etiquetas: 3 });
    const ejemplo = [
      ["San Salvador", 0.38], ["La Libertad", 0.17], ["Santa Ana", 0.09], ["San Miguel", 0.08],
      ["Sonsonate", 0.06], ["La Paz", 0.045], ["Usulután", 0.04], ["Ahuachapán", 0.035],
      ["Cuscatlán", 0.03], ["La Unión", 0.025], ["Chalatenango", 0.02], ["San Vicente", 0.015],
      ["Cabañas", 0.01], ["Morazán", 0.01],
    ].map(([departamento, porcentaje]) => ({ departamento, porcentaje, personas: Math.round(porcentaje * 16872) }));
    alVer(demoMapa, () => mapa.pintar(ejemplo));
  }

  // ---------- Campo de idea: lleva el texto a la app ----------
  document.querySelectorAll("form[data-idea]").forEach((form) => {
    const area = form.querySelector("textarea");
    area.addEventListener("input", () => {
      area.style.height = "auto";
      area.style.height = area.scrollHeight + "px";
    });
    area.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const idea = area.value.trim();
      try {
        if (idea) sessionStorage.setItem("gonogo_idea", idea);
        else sessionStorage.removeItem("gonogo_idea");
      } catch (err) {}
      window.location.href = "/app";
    });
  });
})();
