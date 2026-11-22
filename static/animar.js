/* ============================================================
   gonogo — entradas animadas al hacer scroll
   Efectos propios, inspirados en React Bits (Blur Text, Animated
   List, Decrypted Text), escritos sin librerías.

   Se marca el HTML con data-anima y se llama a GonogoAnimar.observar(raiz):
     data-anima="palabras"   la frase entra palabra por palabra, de borrosa a nítida
     data-anima="lista"      los hijos suben y aparecen uno tras otro
     data-anima="sube"       el elemento sube y aparece
     data-anima="descifrar"  el texto se "descifra" letra por letra
   Cuando el elemento entra en pantalla recibe la clase "visto".

   Si la persona pidió menos movimiento, o el navegador no puede
   observar el scroll, todo se muestra de una vez.
   ============================================================ */

(function () {
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const puede = "IntersectionObserver" in window && !quieto;
  const GLIFOS = ".:-=+ongOGN0";

  // El estado inicial (oculto) solo se aplica si hay con qué revelarlo después.
  if (puede) document.documentElement.classList.add("con-anima");

  function partirEnPalabras(el) {
    if (el.dataset.partido) return;
    const texto = el.textContent;
    el.textContent = "";
    let i = 0;
    texto.split(/(\s+)/).forEach((trozo) => {
      if (!trozo) return;
      if (/^\s+$/.test(trozo)) { el.appendChild(document.createTextNode(" ")); return; }
      const palabra = document.createElement("span");
      palabra.className = "palabra";
      palabra.style.setProperty("--i", i++);
      palabra.textContent = trozo;
      el.appendChild(palabra);
    });
    el.dataset.partido = "1";
  }

  function descifrar(el) {
    const final = el.dataset.texto || el.textContent;
    el.dataset.texto = final;
    const pasos = Math.max(8, Math.min(22, final.length));
    let paso = 0;
    const reloj = setInterval(() => {
      paso++;
      const listos = Math.floor((paso / pasos) * final.length);
      let s = "";
      for (let i = 0; i < final.length; i++) {
        const c = final[i];
        s += i < listos || c === " " ? c : GLIFOS[(Math.random() * GLIFOS.length) | 0];
      }
      el.textContent = s;
      if (paso >= pasos) { clearInterval(reloj); el.textContent = final; }
    }, 38);
  }

  function revelar(el) {
    el.classList.add("visto");
    if (el.dataset.anima === "descifrar" && puede) descifrar(el);
  }

  let ojo = null;
  if (puede) {
    ojo = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        ojo.unobserve(e.target);
        const fn = pendientes.get(e.target);
        if (fn) { pendientes.delete(e.target); fn(); } else revelar(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
  }
  const pendientes = new Map();

  function observar(raiz) {
    (raiz || document).querySelectorAll("[data-anima]").forEach((el) => {
      if (el.dataset.animaLista) return;
      el.dataset.animaLista = "1";
      if (el.dataset.anima === "palabras" && puede) partirEnPalabras(el);
      if (el.dataset.anima === "lista") [...el.children].forEach((hijo, i) => hijo.style.setProperty("--i", i));
      if (ojo) ojo.observe(el); else revelar(el);
    });
  }

  // Corre una función la primera vez que el elemento entra en pantalla.
  function alVer(el, fn) {
    if (!el) return;
    if (!ojo) { fn(); return; }
    pendientes.set(el, fn);
    ojo.observe(el);
  }

  window.GonogoAnimar = { observar, alVer, quieto };
})();
