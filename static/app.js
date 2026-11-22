/* ============================================================
   gonogo — la app
   Tres pantallas (idea, análisis en vivo, reporte) y cuatro
   llamadas al backend: interpretar, mercado, simular, veredicto.
   El servidor no guarda estado: cada paso recibe lo del anterior.
   ============================================================ */

const estado = {
  entrada: "",
  ingreso: { modelo: "suscripcion", monto: 5, ventas: 1, meta: 1000, periodo: "mes" },
  paso0: null,
  interpretacion: null,
  usuario_objetivo: null,
  mercado: null,
  simulacion: null,
  veredicto: null,
  recomendaciones: null,
  proveedores: {},
  avisos: [],
};

const $ = (sel, raiz) => (raiz || document).querySelector(sel);
const $$ = (sel, raiz) => [...(raiz || document).querySelectorAll(sel)];

const CLASE_VEREDICTO = { "GO": "go", "NOT YET": "notyet", "NO-GO": "nogo" };
// Frase corta que acompaña al veredicto: es fija, no la escribe la IA.
const FRASE_VEREDICTO = {
  "GO": "Hay señal. A construir.",
  "NOT YET": "Vas por buen camino. Ahora toca afinar.",
  "NO-GO": "Mejor saberlo hoy que después de construir.",
};
const CAMPOS_LISTA = [
  ["sexos", "Sexo", "Todos"],
  ["areas", "Zona", "Urbana y rural"],
  ["niveles_educativos", "Educación", "Todos los niveles"],
  ["ocupaciones", "Ocupaciones", "Todas"],
  ["departamentos", "Departamentos", "Todo el país"],
];

// Cómo gana dinero el producto. Todos los modelos terminan en lo mismo para
// el cálculo: cuánto deja un cliente al mes, en promedio ("mensual").
//   campo   → qué se le pregunta a la persona
//   inicial → monto con el que arranca, a partir del precio que sugirió la IA
//   cobro   → cómo se le describe el precio a las personas simuladas
//   nota    → el supuesto que usamos, dicho sin vueltas
const MODELOS = {
  suscripcion: {
    nombre: "Suscripción", campo: "Precio al mes",
    inicial: (s) => s, mensual: (m) => m,
    cobro: (m) => `suscripción de USD ${m} al mes`,
    nota: () => "",
  },
  pago_unico: {
    nombre: "Pago único", campo: "Precio de la compra",
    inicial: (s) => s * 12, mensual: (m) => m / 12,
    cobro: (m) => `un solo pago de USD ${m}, sin mensualidad`,
    nota: () => "Contamos una compra por cliente al año.",
  },
  freemium: {
    nombre: "Freemium", campo: "Precio del plan de pago, al mes",
    inicial: (s) => s, mensual: (m) => m,
    cobro: (m) => `gratis para empezar, con un plan de pago opcional de USD ${m} al mes`,
    nota: () => "Los escenarios cuentan solo a quienes pasan al plan de pago.",
  },
  comision: {
    nombre: "Comisión", campo: "Lo que te queda por cada venta",
    inicial: (s) => s, mensual: (m, i) => m * (Number(i.ventas) || 1),
    cobro: () => "gratis para quien la usa; el negocio gana una comisión por cada venta",
    nota: (m, i) => `Cada cliente activo te deja ${usd(m * (Number(i.ventas) || 1))} al mes.`,
  },
  publicidad: {
    nombre: "Publicidad", campo: "Ingreso por usuario activo, al mes",
    inicial: () => 0.3, mensual: (m) => m,
    cobro: () => "gratis para quien la usa, con publicidad",
    nota: () => "Acá cada cliente es un usuario activo, no alguien que paga.",
  },
  no_se: {
    nombre: "Todavía no sé", campo: null,
    inicial: (s) => s, mensual: (m) => m,
    cobro: () => "todavía sin definir",
    nota: (m) => `Usamos ${usd(m)} al mes por cliente como supuesto de trabajo.`,
  },
};
const MODELO_DESDE_IA = {
  "suscripción": "suscripcion", "pago único": "pago_unico", "freemium": "freemium",
  "comisión": "comision", "publicidad": "publicidad", "gratis": "no_se",
};

// ============================================================
// Utilidades
// ============================================================

function html(texto) {
  const d = document.createElement("div");
  d.textContent = texto == null ? "" : String(texto);
  return d.innerHTML;
}

const num = (n) => (n == null ? "—" : new Intl.NumberFormat("es-SV").format(n));
const pct = (x, dec = 1) => (x == null ? "—" : (x * 100).toFixed(dec) + "%");
const usd = (n) => (n == null ? "—" : "$" + new Intl.NumberFormat("es-SV", { maximumFractionDigits: 2 }).format(n));

function puntos(n, total = 6) {
  let s = '<span class="puntos" aria-hidden="true">';
  for (let i = 0; i < total; i++) s += `<i${i < n ? ' class="on"' : ""}></i>`;
  return s + "</span>";
}

function quien(p) {
  if (!p) return "Persona simulada";
  const sexo = p.sex === "Femenino" ? "Mujer" : "Hombre";
  return [sexo, p.age ? p.age + " años" : null, p.department].filter(Boolean).join(", ");
}

// Las IA gratuitas a veces tardan mucho. Pasado el límite seguimos sin esa parte,
// para que la app nunca se quede colgada en una demo.
const LIMITE_MS = 200000;

async function postJSON(url, cuerpo) {
  const corte = new AbortController();
  const alarma = setTimeout(() => corte.abort(), LIMITE_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: corte.signal,
    });
    let data = null;
    try { data = await r.json(); } catch (_) { data = { error: "El servidor respondió algo que no se pudo leer." }; }
    return { ok: r.ok, status: r.status, data };
  } catch (err) {
    const tardo = err && err.name === "AbortError";
    return { ok: false, status: 0, data: { error: tardo
      ? "La IA tardó demasiado en responder."
      : "No hay conexión con el servidor. Revisá que la app siga corriendo." } };
  } finally {
    clearTimeout(alarma);
  }
}

function mostrar(id) {
  $$(".pantalla").forEach((p) => p.classList.toggle("activa", p.id === id));
  $("#btn-nueva").hidden = id === "pantalla-idea";
  window.scrollTo({ top: 0, behavior: "instant" });
}

// Lo que deja un cliente al mes, según el modelo elegido
function precioEfectivo() {
  const { modelo, monto } = estado.ingreso;
  const mensual = MODELOS[modelo].mensual(Number(monto) || 0, estado.ingreso);
  return Math.round(mensual * 100) / 100 || 0;
}

// La meta se pregunta al mes o al año, como le resulte natural a la persona.
// Para el cálculo siempre se lleva a meses.
const META_POR_DEFECTO = 1000;                       // al mes
const esAnual = () => estado.ingreso.periodo === "anio";
const porPeriodo = () => (esAnual() ? 12 : 1);
const textoPeriodo = () => (esAnual() ? "al año" : "al mes");
const metaEfectiva = () => (Number(estado.ingreso.meta) || META_POR_DEFECTO * porPeriodo()) / porPeriodo();

function cambiarPeriodo(periodo) {
  if (periodo === estado.ingreso.periodo) return;
  const meta = Number(estado.ingreso.meta) || 0;
  estado.ingreso.meta = periodo === "anio" ? meta * 12 : Math.round(meta / 12);
  estado.ingreso.periodo = periodo;
}
const periodoNatural = (modelo) => (modelo === "pago_unico" ? "anio" : "mes");
const cobroEnPalabras = () => MODELOS[estado.ingreso.modelo].cobro(Number(estado.ingreso.monto) || 0);

function precioSugerido() {
  return (estado.interpretacion && Number(estado.interpretacion.precio_mensual_sugerido_usd)) || 5;
}

// Pausa corta entre pasos: cuando la respuesta ya está guardada llega al instante,
// y sin esto el mapa y las personas no alcanzan a verse.
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ============================================================
// Arranque
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  const barra = $("#barra");
  window.addEventListener("scroll", () => barra.classList.toggle("con-fondo", window.scrollY > 40), { passive: true });

  if (window.GonogoAscii) GonogoAscii.crear($("#zona-idea"), { ancla: $("#zona-idea .titulo") });

  const area = $("#entrada");
  const ajustar = () => { area.style.height = "auto"; area.style.height = area.scrollHeight + "px"; };
  area.addEventListener("input", () => { ajustar(); avisar(""); });
  area.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") $("#form-idea").requestSubmit();
  });

  $$("[data-ejemplo]").forEach((b) => b.addEventListener("click", () => {
    area.value = b.dataset.ejemplo;
    ajustar();
    area.focus();
  }));

  $("#form-idea").addEventListener("submit", (e) => { e.preventDefault(); analizar(); });
  $("#btn-nueva").addEventListener("click", nuevaIdea);

  try {
    const salud = await (await fetch("/api/salud")).json();
    if (!salud.ia_configurada) {
      avisar("La IA no está configurada: falta el archivo claves.txt en la carpeta del proyecto. Vas a ver el mercado, sin simulación ni redacción.", true);
    }
  } catch (_) {}

  // Si la idea viene escrita desde la home, arrancamos de una vez
  let pendiente = "";
  try {
    pendiente = sessionStorage.getItem("gonogo_idea") || "";
    sessionStorage.removeItem("gonogo_idea");
  } catch (_) {}
  if (pendiente) {
    area.value = pendiente;
    ajustar();
    analizar();
  }
});

function avisar(texto, esError) {
  const a = $("#aviso");
  a.textContent = texto;
  a.classList.toggle("error", !!esError);
}

function nuevaIdea() {
  Object.assign(estado, {
    entrada: "", ingreso: { modelo: "suscripcion", monto: 5, ventas: 1, meta: 1000, periodo: "mes" },
    paso0: null, interpretacion: null,
    usuario_objetivo: null, mercado: null, simulacion: null, veredicto: null,
    recomendaciones: null, proveedores: {}, avisos: [],
  });
  $("#entrada").value = "";
  $("#entrada").style.height = "auto";
  avisar("");
  mostrar("pantalla-idea");
  $("#entrada").focus();
}

// ============================================================
// Análisis en vivo: riel de pasos y tramos
// ============================================================

const reloj = {};

function riel(i, situacion, texto) {
  const li = $("#riel-" + i);
  li.className = situacion || "";
  if (situacion === "activo") reloj[i] = performance.now();
  let lectura = texto || "";
  if (!texto && situacion === "listo" && reloj[i]) {
    lectura = ((performance.now() - reloj[i]) / 1000).toFixed(1) + " s";
  }
  $(".dato", li).textContent = lectura;
}

function tramo(id, titulo, etiqueta, espera) {
  const s = document.createElement("section");
  s.className = "tramo";
  s.id = id;
  s.innerHTML = `
    <header class="tramo-cabeza">
      <h2>${html(titulo)}</h2>
      <span class="dato">${html(etiqueta)}</span>
    </header>
    <div class="tramo-cuerpo">
      <p class="espera"><i></i><i></i><i></i><span>${html(espera)}</span></p>
    </div>`;
  $("#flujo").appendChild(s);
  s.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return $(".tramo-cuerpo", s);
}

async function analizar() {
  const entrada = $("#entrada").value.trim();
  if (!entrada) {
    avisar("Escribí tu idea o pegá un enlace para empezar.", true);
    $("#entrada").focus();
    return;
  }

  estado.entrada = entrada;
  estado.avisos = [];
  estado.proveedores = {};
  estado.simulacion = null;
  estado.recomendaciones = null;

  mostrar("pantalla-analisis");
  $("#flujo").innerHTML = "";
  $("#riel-origen").textContent = "Análisis en curso";
  $("#riel-nombre").textContent = "Leyendo tu idea";
  $("#riel-resumen").textContent = "";
  [1, 2, 3, 4].forEach((i) => riel(i, ""));

  await pasoUsuario();
}

// ---------- Paso 1: interpretar ----------

async function pasoUsuario() {
  riel(1, "activo");
  const cuerpo = tramo("tramo-usuario", "Tu usuario", "Interpretación de la IA", "La IA está leyendo tu idea y armando el perfil de quién la usaría");

  const r = await postJSON("/api/interpretar", { entrada: estado.entrada });

  // La entrada no se pudo leer (enlace caído, texto demasiado largo…)
  if (!r.ok) {
    riel(1, "fallo", "no se pudo leer");
    cuerpo.innerHTML = `
      <p class="nota-aviso grave">${html(r.data.error || "No pudimos leer la entrada.")}</p>
      <p class="ayuda">Si pegaste un enlace, puede que la página cargue todo con JavaScript o pida iniciar sesión. Describí la idea con tus palabras.</p>
      <button class="boton boton-linea boton-chico" type="button" id="btn-volver">Volver y corregir</button>`;
    $("#btn-volver").addEventListener("click", () => mostrar("pantalla-idea"));
    return;
  }

  estado.paso0 = r.data.paso0 || { origen: "Texto escrito", tipo: "texto" };
  estado.proveedores.interpretar = r.data.proveedor;

  let avisos = "";

  if (r.data.interpretacion) {
    estado.interpretacion = r.data.interpretacion;
    estado.usuario_objetivo = { ...r.data.interpretacion.usuario_objetivo };
  } else {
    // La IA no respondió: seguimos con un perfil abierto para mostrar el mercado
    estado.interpretacion = {
      nombre_corto: "Tu idea", resumen: "", modelo_de_ingreso: "suscripción",
      precio_mensual_sugerido_usd: 5, alcance: {},
    };
    estado.usuario_objetivo = {
      descripcion: "Todas las personas de El Salvador",
      edad_min: 18, edad_max: 100,
      sexos: [], areas: [], niveles_educativos: [], ocupaciones: [], departamentos: [],
    };
    estado.avisos.push("La IA no respondió al interpretar la idea. El perfil es el de toda la población.");
    avisos += `<p class="nota-aviso">La IA no respondió. Seguimos con el perfil de toda la población; ajustá la edad si querés acotarlo.</p>`;
  }

  const interp = estado.interpretacion;
  const modeloIA = MODELO_DESDE_IA[interp.modelo_de_ingreso] || "suscripcion";
  estado.ingreso = {
    modelo: modeloIA, monto: MODELOS[modeloIA].inicial(precioSugerido()), ventas: 1,
    meta: META_POR_DEFECTO, periodo: "mes",
  };
  cambiarPeriodo(periodoNatural(modeloIA));

  const alcance = interp.alcance || {};
  if (alcance.es_para_empresas) {
    const t = "Tu idea apunta a empresas. gonogo solo modela personas adultas en El Salvador, así que el mercado puede no reflejar a tu cliente real.";
    estado.avisos.push(t);
    avisos += `<p class="nota-aviso">${t}</p>`;
  } else if (alcance.es_para_personas_adultas_en_el_salvador === false) {
    const t = "Tu idea parece apuntar fuera de El Salvador o a menores de edad. gonogo solo modela adultos en El Salvador.";
    estado.avisos.push(t);
    avisos += `<p class="nota-aviso">${t}</p>`;
  }
  if (r.data.descartados && r.data.descartados.length) {
    avisos += `<p class="nota-aviso info">La IA propuso valores que no existen en los datos y los descartamos: ${html(r.data.descartados.join(", "))}.</p>`;
  }

  $("#riel-origen").textContent = estado.paso0.tipo === "texto" ? "Leído de tu texto" : "Leído de: " + (estado.paso0.origen || "tu enlace");
  $("#riel-nombre").textContent = interp.nombre_corto || "Tu idea";
  $("#riel-resumen").textContent = interp.resumen || "";
  riel(1, "listo");

  cuerpo.innerHTML = `
    ${avisos}
    <div id="ficha-editable">${fichaPerfil(true)}</div>
    <p class="ayuda">Quitá etiquetas para ampliar el perfil. Una fila sin etiquetas incluye a todos.</p>
    <div id="ingreso-editable">${formIngreso()}</div>
    <button class="boton boton-chico" type="button" id="btn-continuar">Continuar con este perfil</button>`;

  // Modelo de ingreso: elegir el modelo cambia la pregunta y el monto inicial
  const cajaIngreso = $("#ingreso-editable");
  cajaIngreso.addEventListener("click", (e) => {
    const p = e.target.closest("button[data-periodo]");
    if (p) {
      cambiarPeriodo(p.dataset.periodo);
      cajaIngreso.innerHTML = formIngreso();
      return;
    }
    const b = e.target.closest("button[data-modelo]");
    if (!b) return;
    const modelo = b.dataset.modelo;
    estado.ingreso.modelo = modelo;
    estado.ingreso.monto = MODELOS[modelo].inicial(precioSugerido());
    estado.ingreso.ventas = 1;
    cambiarPeriodo(periodoNatural(modelo));     // pago único se piensa por año
    cajaIngreso.innerHTML = formIngreso();
  });
  cajaIngreso.addEventListener("input", (e) => {
    const campo = e.target.dataset.ingreso;
    if (!campo) return;
    const v = parseFloat(e.target.value);
    estado.ingreso[campo] = isFinite(v) && v >= 0 ? v : 0;
    const nota = $("#ingreso-nota");
    if (nota) nota.textContent = notaIngreso();
  });

  $("#ficha-editable").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-campo]");
    if (!b) return;
    const lista = estado.usuario_objetivo[b.dataset.campo] || [];
    estado.usuario_objetivo[b.dataset.campo] = lista.filter((v) => v !== b.dataset.valor);
    $("#ficha-editable").innerHTML = fichaPerfil(true);
  });
  $("#ficha-editable").addEventListener("change", (e) => {
    if (!e.target.matches("input[data-edad]")) return;
    let v = Math.round(parseFloat(e.target.value));
    if (!isFinite(v)) v = e.target.dataset.edad === "min" ? 18 : 100;
    v = Math.min(100, Math.max(18, v));
    const uo = estado.usuario_objetivo;
    if (e.target.dataset.edad === "min") uo.edad_min = Math.min(v, uo.edad_max || 100);
    else uo.edad_max = Math.max(v, uo.edad_min || 18);
    $("#ficha-editable").innerHTML = fichaPerfil(true);
  });

  $("#btn-continuar").addEventListener("click", async () => {
    $("#btn-continuar").remove();
    $(".ayuda", cuerpo).remove();
    $("#ingreso-editable").remove();
    if (!Number(estado.ingreso.meta)) estado.ingreso.meta = META_POR_DEFECTO * porPeriodo();
    if (!Number(estado.ingreso.ventas)) estado.ingreso.ventas = 1;
    $("#ficha-editable").innerHTML = fichaPerfil(false);
    await pasoMercado();
  });
}

function fichaPerfil(editable) {
  const uo = estado.usuario_objetivo;
  const interp = estado.interpretacion;

  const edad = editable
    ? `<span class="edad">
         <label class="solo-lectores" for="edad-min">Edad mínima</label>
         <input id="edad-min" data-edad="min" type="number" min="18" max="100" value="${uo.edad_min || 18}">
         <span>a</span>
         <label class="solo-lectores" for="edad-max">Edad máxima</label>
         <input id="edad-max" data-edad="max" type="number" min="18" max="100" value="${uo.edad_max || 100}">
         <span>años</span>
       </span>`
    : `${uo.edad_min || 18} a ${uo.edad_max || 100} años`;

  const filas = CAMPOS_LISTA.map(([campo, nombre, vacio]) => {
    const lista = uo[campo] || [];
    const chips = lista.length
      ? lista.map((v) => `<span class="chip">${html(v)}${editable
          ? `<button type="button" data-campo="${campo}" data-valor="${html(v)}" aria-label="Quitar ${html(v)}">×</button>` : ""}</span>`).join("")
      : `<span class="chip vacio">${vacio}</span>`;
    return `<div class="campo">${nombre}</div><div class="valor">${chips}</div>`;
  }).join("");

  // Mientras se edita, el ingreso tiene su propio formulario debajo
  const ingreso = editable ? "" : `
    <div class="campo">Cómo gana dinero</div><div class="valor">${html(resumenIngreso())}</div>
    <div class="campo">Tu meta</div><div class="valor">Vender ${usd(metaEfectiva() * porPeriodo())} ${textoPeriodo()}</div>`;

  return `<div class="ficha">
    <div class="campo">Quién</div><div class="valor">${html(uo.descripcion || "—")}</div>
    <div class="campo">Edad</div><div class="valor">${edad}</div>
    ${filas}
    ${ingreso}
  </div>`;
}

// El mismo perfil, como retrato para el reporte: cada dato con su forma.
function retratoUsuario() {
  const uo = estado.usuario_objetivo;
  const min = uo.edad_min || 18;
  const max = uo.edad_max || 100;

  // Regla de edad: un punto cada 2 años, de 18 a 100.
  let regla = "", n = 0;
  for (let a = 18; a <= 100; a += 2) {
    const dentro = a + 1 >= min && a <= max;
    regla += `<i${dentro ? ` class="si" style="--i:${n++}"` : ""}></i>`;
  }

  const rasgos = CAMPOS_LISTA.filter(([campo]) => campo !== "departamentos").map(([campo, nombre, vacio]) => {
    const lista = uo[campo] || [];
    const chips = lista.length
      ? lista.map((v) => `<span class="chip">${html(v)}</span>`).join("")
      : `<span class="chip vacio">${vacio}</span>`;
    return `<div class="ru-rasgo"><span class="dato" data-anima="descifrar">${nombre}</span><div class="ru-chips">${chips}</div></div>`;
  }).join("");

  const deptos = uo.departamentos || [];
  const donde = deptos.length
    ? deptos.map((v) => `<span class="chip">${html(v)}</span>`).join("")
    : `<span class="chip vacio">Todo el país</span>`;

  return `
    <p class="ru-quien" data-anima="palabras">${html(uo.descripcion || "—")}</p>
    <div class="ru-cuerpo">
      <div class="ru-rasgos" data-anima="lista">
        <div class="ru-rasgo ru-edad">
          <span class="dato" data-anima="descifrar">Edad</span>
          <p class="ru-edad-valor">${min} a ${max} años</p>
          <div class="ru-regla-caja" aria-hidden="true">
            <div class="ru-regla" data-anima="sube">${regla}</div>
            <div class="ru-escala dato"><span>18</span><span>100</span></div>
          </div>
        </div>
        ${rasgos}
      </div>
      <figure class="ru-donde" data-anima="sube">
        <span class="dato" data-anima="descifrar">Dónde</span>
        <div class="ru-mapa" id="mapa-usuario"></div>
        <figcaption class="ru-chips">${donde}</figcaption>
      </figure>
    </div>
    <div>
      <h3>Tu negocio</h3>
      <div class="ru-negocio" data-anima="lista">
        <div>
          <span class="dato">Cómo gana dinero</span>
          <p>${html(resumenIngreso())}</p>
        </div>
        <div>
          <span class="dato">Tu meta</span>
          <p>Vender ${usd(metaEfectiva() * porPeriodo())} ${textoPeriodo()}</p>
        </div>
      </div>
    </div>`;
}

// Enciende en el mapa los departamentos del perfil (o todo el país), de oeste a este.
function pintarMapaUsuario() {
  const el = $("#mapa-usuario");
  if (!el || !window.GonogoMapa) return;
  const mapa = GonogoMapa.crear(el, { interactivo: false });
  const elegidos = estado.usuario_objetivo.departamentos || [];
  const nombres = elegidos.length ? elegidos : ((window.SV_PUNTOS || {}).deptos || []);
  const lista = nombres.map((d) => ({ departamento: d, personas: 1, porcentaje: 0 }));

  const svg = el.querySelector("svg");
  if (svg) {
    const ancho = svg.viewBox.baseVal.width || 1;
    svg.setAttribute("aria-label", elegidos.length
      ? "Mapa de El Salvador con estos departamentos marcados: " + elegidos.join(", ")
      : "Mapa de El Salvador, todo el país marcado");
    svg.querySelectorAll("circle").forEach((c) => {
      c.style.transitionDelay = Math.round((c.cx.baseVal.value / ancho) * 700) + "ms";
    });
  }
  let hecho = false;
  const pintar = () => { if (!hecho) { hecho = true; mapa.pintar(lista); } };
  if (window.GonogoAnimar) GonogoAnimar.alVer(el, pintar); else pintar();
  window.addEventListener("beforeprint", pintar, { once: true });  // que el PDF no salga con el mapa apagado
}

// ---------- Paso 2: mercado ----------

function cifraMercado(m) {
  // La proporción sale de Nemotron; las personas, de la población del país.
  return `<div class="cifra">${num(m.personas_estimadas)}</div>
    <p class="cifra-unidad">personas en El Salvador, aproximadamente: el ${pct(m.porcentaje_de_adultos)} de la población</p>`;
}

// Lleva una lista con conteos de Nemotron a personas del país, con la misma
// proporción que la cifra principal, para que todo el reporte hable en una sola escala.
function aEscalaPais(m, lista) {
  const factor = m.poblacion_pais && m.total_poblacion ? m.poblacion_pais / m.total_poblacion : 1;
  return (lista || []).map((x) => ({ ...x, personas: Math.round(x.personas * factor) }));
}

function origenDelMercado(m) {
  return `La proporción sale de Nemotron (${num(m.personas_en_muestra)} de sus ${num(m.total_poblacion)} personas cumplen el perfil) y se aplica a los ${num(m.poblacion_pais)} habitantes del Censo 2024.`;
}

function barras(lista, nombre, tope) {
  const max = Math.max(...lista.map((x) => x.porcentaje), 0.0001);
  return `<ul class="lista-barras">${lista.slice(0, tope || lista.length).map((x) => `
    <li><span>${html(x[nombre])}</span><span class="num">${pct(x.porcentaje)}</span>
    <span class="pista"><i style="width:${((x.porcentaje / max) * 100).toFixed(1)}%"></i></span></li>`).join("")}</ul>`;
}

async function pasoMercado() {
  riel(2, "activo");
  const cuerpo = tramo("tramo-mercado", "Tu mercado", "Calibrado con el Censo 2024", "Contando cuántas de las 148,000 personas cumplen el perfil");

  const r = await postJSON("/api/mercado", { usuario_objetivo: estado.usuario_objetivo });
  if (!r.ok) {
    riel(2, "fallo", "falló");
    cuerpo.innerHTML = `<p class="nota-aviso grave">${html(r.data.error || "No se pudo calcular el mercado.")}</p>`;
    return;
  }
  const m = (estado.mercado = r.data);
  riel(2, "listo");

  const relaj = (m.relajaciones || []).length
    ? `<p class="nota-aviso">El perfil dejaba muy poca gente y lo ampliamos: ${m.relajaciones.map(html).join(" ")}</p>` : "";
  if ((m.relajaciones || []).length) estado.avisos.push("El perfil se amplió porque dejaba menos de 300 personas: " + m.relajaciones.join(" "));

  cuerpo.innerHTML = `
    ${relaj}
    <div id="mapa-vivo" style="color:#fff"></div>
    <div class="dos-col" style="align-items:end">
      <div>${cifraMercado(m)}</div>
      <div>${barras(m.por_departamento || [], "departamento", 4).replace('class="lista-barras"', 'class="lista-barras" style="margin-top:0"')}</div>
    </div>
    <p class="ayuda">${origenDelMercado(m)} Pasá el cursor por el mapa para ver cada departamento.</p>`;

  const mapa = GonogoMapa.crear($("#mapa-vivo"), { etiquetas: 3 });
  requestAnimationFrame(() => mapa.pintar(aEscalaPais(m, m.por_departamento)));

  await pausa(1800);
  await pasoSimulacion();
}

// ---------- Paso 3: simular ----------

async function pasoSimulacion() {
  riel(3, "activo");
  const cuerpo = tramo("tramo-personas", "24 personas simuladas", "Personas sintéticas", "24 personas del perfil están leyendo tu idea. Esto puede tardar medio minuto");

  const r = await postJSON("/api/simular", {
    idea: estado.entrada,
    resumen: estado.interpretacion.resumen,
    precio_mensual_usd: precioEfectivo(),
    cobro: cobroEnPalabras(),
    usuario_objetivo: estado.usuario_objetivo,
  });

  if (!r.ok || !r.data.reacciones) {
    riel(3, "fallo", "sin simulación");
    estado.avisos.push("La simulación no estuvo disponible, así que la aceptación se contó como baja.");
    cuerpo.innerHTML = `<p class="nota-aviso">${html((r.data && r.data.error) || "La simulación no está disponible.")} El veredicto va a contar la aceptación como baja.</p>`;
  } else {
    const s = (estado.simulacion = r.data);
    estado.proveedores.simular = s.proveedor;
    riel(3, "listo");

    const orden = { alto: 0, medio: 1, bajo: 2, ninguno: 3 };
    const destacadas = [...s.reacciones].sort((a, b) => orden[a.interes] - orden[b.interes]);
    const elegidas = [destacadas[0], destacadas[Math.floor(destacadas.length / 2)], destacadas[destacadas.length - 1]]
      .filter((x, i, arr) => x && arr.indexOf(x) === i);

    cuerpo.innerHTML = `
      <div class="personas" id="personas-vivo"></div>
      ${leyendaInteres(s)}
      <div>${elegidas.map((x) => `
        <div class="reaccion ${x.interes}"><i></i><div><q>${html(x.razon)}</q>
        <small>${html(quien(x.persona))}. Lo que la frena: ${html(x.barrera || "nada en particular")}.</small></div></div>`).join("")}
      </div>`;

    // Los puntos aparecen de uno en uno: cada punto es una persona
    const rejilla = $("#personas-vivo");
    s.reacciones.forEach((x, i) => {
      const p = document.createElement("i");
      p.className = "persona";
      rejilla.appendChild(p);
      setTimeout(() => p.classList.add(x.interes), 60 * i);
    });
    await pausa(60 * s.reacciones.length + 1200);
  }

  await pasoVeredicto();
}

function leyendaInteres(s) {
  const c = { alto: 0, medio: 0, bajo: 0, ninguno: 0 };
  s.reacciones.forEach((x) => { c[x.interes] = (c[x.interes] || 0) + 1; });
  return `<div class="leyenda">
    <span class="alto"><i></i>${c.alto} con interés alto</span>
    <span class="medio"><i></i>${c.medio} medio</span>
    <span><i></i>${c.bajo} bajo</span>
    <span class="ninguno"><i></i>${c.ninguno} ninguno</span>
  </div>`;
}

// ---------- Paso 4: veredicto ----------

async function pasoVeredicto() {
  riel(4, "activo");
  const cuerpo = tramo("tramo-veredicto", "Veredicto", "Lo decide el código", "Sumando los puntos y redactando las recomendaciones");

  const r = await postJSON("/api/veredicto", {
    idea: estado.entrada,
    resumen: estado.interpretacion.resumen,
    precio_mensual_usd: precioEfectivo(),
    meta_mensual_usd: metaEfectiva(),
    cobro: cobroEnPalabras(),
    modelo: estado.ingreso.modelo,
    periodo: estado.ingreso.periodo,
    mercado: estado.mercado,
    simulacion: estado.simulacion || { proyeccion: "baja", puntaje: 0, altos: 0, medios: 0, total: 0, barreras_top: [] },
  });

  if (!r.ok) {
    riel(4, "fallo", "falló");
    cuerpo.innerHTML = `<p class="nota-aviso grave">${html(r.data.error || "No se pudo calcular el veredicto.")}</p>`;
    return;
  }

  const v = (estado.veredicto = r.data);
  estado.proveedores.redactar = v.proveedor_redaccion;
  riel(4, "listo", v.veredicto);

  cuerpo.innerHTML = `<div class="sello ${CLASE_VEREDICTO[v.veredicto]}">${html(v.veredicto)}</div>`;
  await pausa(1500);
  pintarReporte();
  mostrar("pantalla-reporte");
}

// ============================================================
// El reporte
// ============================================================

function pintarReporte() {
  const v = estado.veredicto;
  const m = estado.mercado;
  const s = estado.simulacion;
  const interp = estado.interpretacion;
  const red = v.redaccion || {};
  const clase = CLASE_VEREDICTO[v.veredicto] || "notyet";
  const tope = v.puntos_max || 10;
  const cortes = v.cortes || { go: 8, not_yet: 5 };

  // ---------- Banda del veredicto ----------
  const razones = (red.razones || []).length
    ? red.razones.map((x) => `<li>${html(x)}</li>`).join("")
    : (v.criterios || []).map((c) => `<li>${html(c.detalle)}.</li>`).join("");

  const banda = `
    <header class="banda ${clase}">
      <div class="banda-dentro">
        <div class="banda-idea">
          <span>Reporte de realidad: ${html(interp.nombre_corto || "tu idea")}</span>
          <span class="dato">${estado.paso0 && estado.paso0.tipo !== "texto" ? html(estado.paso0.origen) : "Mercado de El Salvador"}</span>
        </div>
        <h1 class="veredicto-palabra">${html(v.veredicto)}</h1>
        ${FRASE_VEREDICTO[v.veredicto] ? `<p class="banda-frase">${FRASE_VEREDICTO[v.veredicto]}</p>` : ""}
        <p class="banda-puntaje">${puntos(v.puntos, tope)}<span>${v.puntos} de ${tope} puntos</span></p>
        ${v.nota_veredicto ? `<p class="banda-nota">${html(v.nota_veredicto)}</p>` : ""}
        <ul class="razones">${razones}</ul>
      </div>
    </header>`;

  // ---------- Avisos acumulados ----------
  const avisos = estado.avisos.length
    ? `<div style="padding-top:32px">${estado.avisos.map((a) => `<p class="nota-aviso" style="margin-top:8px">${html(a)}</p>`).join("")}</div>` : "";

  // ---------- Tu usuario ----------
  const bUsuario = bloque("Tu usuario", "interpretacion", "Interpretación de la IA", `
    ${interp.resumen ? `<p class="texto-grande">${html(interp.resumen)}</p>` : ""}
    ${retratoUsuario()}`);

  // ---------- Tu mercado ----------
  const comp = m.composicion || {};
  const grupo = (titulo, lista) => (lista && lista.length ? `<div><h3>${titulo}</h3>${barras(lista, "valor")}</div>` : "");
  const listaNum = (lista, clave) => `<ul class="lista-barras">${aEscalaPais(m, lista).map((x) => `
    <li><span>${html(x[clave])}</span><span class="num">${num(x.personas)}</span></li>`).join("")}</ul>`;

  const bMercado = bloque("Tu mercado", "", "Dato calibrado con el Censo 2024", `
    <div>
      ${cifraMercado(m)}
      <p style="margin-top:10px;color:var(--tinta-suave);font-size:0.92rem">${origenDelMercado(m)} Nemotron solo tiene personas adultas, así que para productos pensados para menores la cifra es una aproximación.</p>
    </div>
    <div class="panel"><div class="panel-cuerpo"><div id="mapa-reporte"></div></div></div>
    <div class="dos-col">
      <div><h3>Por departamento</h3>${barras(m.por_departamento || [], "departamento", 7)}</div>
      <div><h3>Los 10 municipios con más personas</h3>${listaNum(m.por_municipio, "municipio")}</div>
    </div>
    <div class="dos-col">
      ${grupo("Sexo", comp.por_sexo)}
      ${grupo("Zona", comp.por_area)}
      ${grupo("Edad", comp.por_grupo_edad)}
      ${grupo("Educación", comp.por_educacion)}
      ${grupo("Tipo de hogar", comp.por_tipo_hogar)}
      <div><h3>Ocupaciones más frecuentes</h3>${listaNum(m.ocupaciones_principales, "ocupacion")}</div>
    </div>`);

  // ---------- Retratos ----------
  const bRetratos = bloque("Retratos", "simulacion", "Personas sintéticas", s && (s.retratos || []).length
    ? s.retratos.map((x) => {
        const p = x.persona || {};
        const historia = (p.persona || "").trim();
        return `<article class="retrato ${x.interes}">
          <div class="retrato-quien">
            <b><i></i>${html(quien(p))}</b>
            ${html([p.occupation, p.education_level, p.area].filter(Boolean).join(", "))}
            <br>Interés ${html(x.interes)}${x.pagaria ? ", pagaría" : ", no pagaría"}
          </div>
          <div>
            <blockquote>“${html(x.razon)}”</blockquote>
            <p class="barrera">Lo que la frena: ${html(x.barrera || "nada en particular")}.</p>
            ${historia ? `<p class="barrera">${html(historia.slice(0, 260))}${historia.length > 260 ? "…" : ""}</p>` : ""}
          </div>
        </article>`;
      }).join("")
    : `<p>La simulación no estuvo disponible en este análisis.</p>`);

  // ---------- Proyección de aceptación ----------
  const bAceptacion = bloque("Proyección de aceptación", "simulacion", "Estimación simulada, no validada", s
    ? `<div class="dos-col">
        <div>
          <div class="cifra">${pct(s.puntaje, 0)}</div>
          <p class="cifra-unidad">puntaje de aceptación, proyección ${html(s.proyeccion)}</p>
        </div>
        <div>
          <div class="personas" id="personas-reporte">${s.reacciones.map((x, i) =>
            `<button type="button" class="persona ${x.interes}" data-i="${i}" aria-label="${html(quien(x.persona))}, interés ${x.interes}"></button>`).join("")}</div>
          ${leyendaInteres(s)}
        </div>
      </div>
      <div class="persona-detalle" id="persona-detalle">Tocá un punto para leer lo que dijo esa persona.</div>
      ${(s.barreras_top || []).length ? `<div><h3>Lo que más las frena</h3>
        <ul class="lista-barras">${s.barreras_top.map((b) => `
          <li><span>${html(b.barrera)}</span><span class="num">${b.veces} ${b.veces === 1 ? "vez" : "veces"}</span></li>`).join("")}</ul></div>` : ""}`
    : `<p>La simulación no estuvo disponible, así que la aceptación se contó como baja.</p>`);

  // ---------- ¿Te alcanza? ----------
  const e = v.escenarios || { escenarios: [] };
  const escala = Math.max(e.meta_mensual_usd || 0, ...e.escenarios.map((x) => x.ingreso_mensual_usd), 1) * 1.04;
  const porMuestra = e.unidad && e.unidad !== "personas";
  const bIngresos = bloque("¿Te alcanza?", "supuesto", "Cálculo con supuestos", `
    <p>${html(resumenIngreso())}. Tu meta es vender ${usd(e.meta_mensual_usd * porPeriodo())} ${textoPeriodo()}.</p>
    <p>${supuestoDeClientes(e)} Son ventas, antes de restar costos.</p>
    ${e.personas_total > 0 && e.personas_que_si === 0 ? `<p class="nota-aviso">Ninguna de las personas simuladas ${e.tasa_origen === "usarian" ? "la usaría" : "pagaría"}, así que el ingreso estimado es cero. Antes de construir, revisá el precio o a quién va dirigida.</p>` : ""}

    <div>
      ${e.escenarios.map((x) => `
        <div class="escenario ${x.nombre}" style="--meta:${((e.meta_mensual_usd / escala) * 100).toFixed(1)}%">
          <span>${html(x.nombre.charAt(0).toUpperCase() + x.nombre.slice(1))}</span>
          <span class="pista"><i style="width:${((x.ingreso_mensual_usd / escala) * 100).toFixed(1)}%"></i></span>
          <span class="monto">${usd(x.ingreso_mensual_usd * porPeriodo())}</span>
          <small>${x.personas_alcanzadas != null ? `Llegás a ${num(x.personas_alcanzadas)} personas y ` : ""}${num(x.clientes)} ${estado.ingreso.modelo === "publicidad" ? "son usuarios activos" : "se vuelven clientes"}. Cubre el ${(x.porcentaje_de_la_meta * 100).toFixed(0)}% de la meta.</small>
        </div>`).join("")}
    </div>
    <p class="escenario-leyenda">Tu meta ${esAnual() ? "del año" : "del mes"}. Los montos son ventas ${textoPeriodo()}.</p>`);

  // ---------- Próximos pasos ----------
  const ent = red.entrevistas || {};
  const bProximos = bloque("Próximos pasos", "recomendacion", "Recomendación", v.redaccion
    ? `${red.siguiente_paso ? `<div class="siguiente"><span class="dato">La prueba más barata</span><p>${html(red.siguiente_paso)}</p></div>` : ""}
       ${(red.riesgos || []).length ? `<div><h3>Riesgos principales</h3><ul class="lista-linea" style="margin-top:14px">${red.riesgos.map((x) => `<li>${html(x)}</li>`).join("")}</ul></div>` : ""}
       ${ent.a_quien ? `<div><h3>A quién entrevistar</h3><p style="margin-top:10px">${html(ent.a_quien)}</p></div>` : ""}
       ${(ent.preguntas || []).length ? `<div><h3>Qué preguntarle</h3><ol class="preguntas" style="margin-top:6px">${ent.preguntas.map((x) => `<li>${html(x)}</li>`).join("")}</ol></div>` : ""}`
    : `<p class="nota-aviso">La IA no respondió al redactar las recomendaciones. El veredicto y los números de arriba no dependen de ella.</p>`);

  // ---------- Pie ----------
  const prov = [
    estado.proveedores.interpretar && "interpretar con " + estado.proveedores.interpretar,
    estado.proveedores.simular && "simular con " + estado.proveedores.simular,
    estado.proveedores.redactar && "redactar con " + estado.proveedores.redactar,
  ].filter(Boolean);

  const pie = `
    <footer class="reporte-pie">
      <div>
        <h3 class="subtitulo" style="margin-bottom:20px">De dónde sale el veredicto</h3>
        <table class="tabla">
          <thead><tr><th>Criterio</th><th>Detalle</th><th>Puntos</th></tr></thead>
          <tbody>
            ${(v.criterios || []).map((c) => `<tr><td>${html(c.nombre)}</td><td>${html(c.detalle)}</td><td style="white-space:nowrap">${puntos(c.puntos, c.maximo || 2)}</td></tr>`).join("")}
            <tr><td>Total</td><td>De ${cortes.go} a ${tope} es GO, de ${cortes.not_yet} a ${cortes.go - 1} es NOT YET, de 0 a ${cortes.not_yet - 1} es NO-GO. Si la aceptación tiene 0 puntos, es NO-GO.</td><td style="white-space:nowrap">${v.puntos} de ${tope}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="proveedores">${prov.length ? "IA que respondió: " + html(prov.join("; ")) + "." : "Ninguna IA respondió en este análisis."}</p>
      <p class="nota-fija">gonogo usa personas sintéticas de NVIDIA Nemotron-Personas-El-Salvador. Los datos demográficos están calibrados con el Censo 2024. La proyección de aceptación es una simulación: orienta, y la demanda real se comprueba con personas reales.</p>
      <div class="botones">
        <button class="boton boton-tinta" type="button" id="btn-pdf">Descargar PDF</button>
        <button class="boton boton-linea-tinta" type="button" id="btn-recomendar">Crear recomendaciones</button>
      </div>
    </footer>`;

  $("#reporte").innerHTML = `${banda}<div class="hoja">${avisos}${bUsuario}${bMercado}${bRetratos}${bAceptacion}${bIngresos}${bProximos}<div id="zona-recomendaciones"></div>${pie}</div>`;

  // ---------- Comportamiento ----------
  const mapa = GonogoMapa.crear($("#mapa-reporte"), { etiquetas: 5 });
  setTimeout(() => mapa.pintar(aEscalaPais(m, m.por_departamento)), 200);
  pintarMapaUsuario();
  if (window.GonogoAnimar) GonogoAnimar.observar($("#reporte"));

  const rejilla = $("#personas-reporte");
  if (rejilla) {
    const ver = (i) => {
      const x = s.reacciones[i];
      $$(".persona", rejilla).forEach((b, j) => b.classList.toggle("activa", j === i));
      $("#persona-detalle").innerHTML = `“${html(x.razon)}”
        <small>${html(quien(x.persona))}. Interés ${html(x.interes)}${x.pagaria ? ", pagaría" : ", no pagaría"}. Lo que la frena: ${html(x.barrera || "nada en particular")}.</small>`;
    };
    rejilla.addEventListener("click", (ev) => {
      const b = ev.target.closest(".persona");
      if (b) ver(Number(b.dataset.i));
    });
  }

  $("#btn-pdf").addEventListener("click", () => window.print());
  $("#btn-recomendar").addEventListener("click", crearRecomendaciones);
}

// ============================================================
// Modelo de ingreso
// ============================================================

// Explica de dónde salen los clientes de cada escenario: a cuánta gente del
// mercado se llega, y qué parte de ella paga según la simulación.
function supuestoDeClientes(e) {
  const alcances = (e.escenarios || []).map((x) => x.alcance).filter((a) => a != null)
    .map((a) => (a * 100).toLocaleString("es-SV", { maximumFractionDigits: 1 }) + "%");
  if (!alcances.length || e.tasa_origen == null) {
    return "Suponemos que el 0.5%, el 2% o el 5% del mercado se vuelve cliente.";
  }
  const llegada = `Suponemos que en el primer año llegás al ${alcances.slice(0, -1).join(", ")} o ${alcances[alcances.length - 1]} de tu mercado`;
  if (e.tasa_origen === "sin_simulacion") {
    const cada = Math.round(1 / (e.tasa_conversion || 0.05));
    return `${llegada} y, como no hubo simulación, que 1 de cada ${cada} personas alcanzadas se vuelve cliente.`;
  }
  const cuantas = `${e.personas_que_si} de ${e.personas_total}`;
  const cada = Math.round(1 / (e.cumplimiento || 1));
  const delDicho = cada > 1 ? `De ellas contamos a 1 de cada ${cada}, porque decir que sí es más fácil que hacerlo.` : "";
  return e.tasa_origen === "usarian"
    ? `${llegada}. En la simulación, ${cuantas} personas mostraron interés en usarla. ${delDicho}`
    : `${llegada}. En la simulación, ${cuantas} personas dijeron que pagarían. ${delDicho}`;
}

function resumenIngreso() {
  const { modelo, monto } = estado.ingreso;
  const m = MODELOS[modelo];
  const n = Number(monto) || 0;
  const frases = {
    suscripcion: `Suscripción de ${usd(n)} al mes`,
    pago_unico: `Pago único de ${usd(n)}, con una compra por cliente al año`,
    freemium: `Freemium, con un plan de pago de ${usd(n)} al mes`,
    comision: `Comisión de ${usd(n)} por venta, con ${ventasTexto()} al mes por cliente`,
    publicidad: `Publicidad, con ${usd(n)} al mes por usuario activo`,
    no_se: `Modelo sin definir; usamos ${usd(n)} al mes por cliente como supuesto`,
  };
  return frases[modelo] || m.nombre;
}

function ventasTexto() {
  const v = Number(estado.ingreso.ventas) || 1;
  return v === 1 ? "una venta" : `${v} ventas`;
}

function notaIngreso() {
  const { modelo, monto } = estado.ingreso;
  return MODELOS[modelo].nota(Number(monto) || 0, estado.ingreso);
}

function formIngreso() {
  const { modelo, monto, meta, ventas, periodo } = estado.ingreso;
  const m = MODELOS[modelo];
  const botonPeriodo = (clave, texto) =>
    `<button type="button" class="chip opcion" data-periodo="${clave}" aria-pressed="${clave === periodo}">${texto}</button>`;
  const opciones = Object.entries(MODELOS).map(([clave, x]) =>
    `<button type="button" class="chip opcion" data-modelo="${clave}" aria-pressed="${clave === modelo}">${x.nombre}</button>`).join("");
  const propuesto = MODELO_DESDE_IA[estado.interpretacion.modelo_de_ingreso];

  return `<fieldset class="ingreso">
    <legend>Cómo vas a ganar dinero</legend>
    <p class="ayuda">${propuesto && estado.proveedores.interpretar
      ? `La IA propuso “${MODELOS[propuesto].nombre.toLowerCase()}”. Cambialo si no es tu caso.`
      : "Elegí el que más se parezca a tu caso."}</p>
    <div class="ingreso-opciones">${opciones}</div>
    <div class="opcionales">
      ${m.campo ? `<div class="opcional">
        <label for="ingreso-monto">${m.campo}</label>
        <div class="con-signo"><span class="dato">USD</span><input id="ingreso-monto" data-ingreso="monto" type="number" inputmode="decimal" min="0" step="0.5" value="${monto}"></div>
      </div>` : ""}
      ${modelo === "comision" ? `<div class="opcional">
        <label for="ingreso-ventas">Ventas por cliente al mes</label>
        <div class="con-signo"><input id="ingreso-ventas" data-ingreso="ventas" type="number" inputmode="decimal" min="0" step="1" value="${ventas}"></div>
      </div>` : ""}
    </div>
    <p class="ayuda" id="ingreso-nota">${html(notaIngreso())}</p>
  </fieldset>

  <fieldset class="ingreso">
    <legend>Tu meta</legend>
    <div class="opcionales meta-fila">
      <div class="opcional">
        <label for="ingreso-meta">¿Cuánto tiene que vender el proyecto para que te valga la pena?</label>
        <div class="con-signo"><span class="dato">USD</span><input id="ingreso-meta" data-ingreso="meta" type="number" inputmode="decimal" min="0" step="50" value="${meta}"></div>
      </div>
      <div class="ingreso-opciones" role="group" aria-label="Periodo de la meta">
        ${botonPeriodo("mes", "Al mes")}${botonPeriodo("anio", "Al año")}
      </div>
    </div>
    <p class="ayuda">Son ventas, antes de restar costos.</p>
  </fieldset>`;
}

// ============================================================
// Recomendaciones (se piden aparte, desde el reporte)
// ============================================================

// Secciones que deben venir en las recomendaciones; si falta alguna, se ofrece volver a pedir.
const SECCIONES_REC = [
  ["resumen", "el rumbo del producto"],
  ["para_el_mercado_local", "los ajustes para el mercado salvadoreño"],
  ["que_debe_tener", "lo que debe tener desde el inicio"],
  ["como_mejorar_la_proyeccion", "cómo subir tu puntaje"],
  ["plan_30_dias", "el plan de 30 días"],
];

function avisoVolverAPedir(mensaje) {
  return `<div class="nota-aviso con-boton">
    <p>${html(mensaje)}</p>
    <button class="boton boton-chico boton-tinta" type="button" data-volver-a-pedir>Volver a pedir</button>
  </div>`;
}

async function crearRecomendaciones(deNuevo) {
  deNuevo = deNuevo === true;
  const boton = $("#btn-recomendar");
  const zona = $("#zona-recomendaciones");
  boton.disabled = true;
  boton.textContent = "Creando recomendaciones…";

  zona.innerHTML = bloque("Recomendaciones", "recomendacion", "Recomendación de la IA",
    `<p class="espera"><i></i><i></i><i></i><span>La IA está leyendo tu reporte para proponerte mejoras. Puede tardar un minuto.</span></p>`);
  zona.scrollIntoView({ behavior: "smooth", block: "start" });

  const r = await postJSON("/api/recomendaciones", {
    idea: estado.entrada,
    resumen: estado.interpretacion.resumen,
    cobro: cobroEnPalabras(),
    periodo: estado.ingreso.periodo,
    usuario_objetivo: estado.usuario_objetivo,
    mercado: estado.mercado,
    simulacion: estado.simulacion,
    veredicto: estado.veredicto,
    de_nuevo: deNuevo,
  });

  const volver = () => {
    const b = zona.querySelector("[data-volver-a-pedir]");
    if (b) b.addEventListener("click", () => crearRecomendaciones(true));
  };

  const rec = r.data && r.data.recomendaciones;
  if (!r.ok || !rec) {
    zona.innerHTML = bloque("Recomendaciones", "recomendacion", "Recomendación de la IA",
      avisoVolverAPedir((r.data && r.data.error) || "La IA no respondió. Podés volver a pedir las recomendaciones."));
    volver();
    boton.disabled = false;
    boton.textContent = "Volver a pedir recomendaciones";
    return;
  }

  estado.recomendaciones = rec;
  estado.proveedores.recomendar = r.data.proveedor;

  const faltan = SECCIONES_REC.filter(([campo]) => !(rec[campo] && rec[campo].length)).map(([, nombre]) => nombre);
  const aviso = faltan.length
    ? avisoVolverAPedir(`La IA dejó sin responder ${faltan.length > 1 ? "estas partes" : "esta parte"}: ${faltan.join("; ")}. Podés volver a pedir las recomendaciones.`)
    : "";

  zona.innerHTML = bloque("Recomendaciones", "recomendacion", "Recomendación de la IA", aviso + htmlRecomendaciones(rec));
  activarRecomendaciones(zona, rec);
  volver();

  boton.textContent = "Recomendaciones creadas";
  const prov = $(".proveedores");
  if (prov && r.data.proveedor) prov.textContent = prov.textContent.replace(/; recomendar con [^;]*$/, "").replace(/\.$/, "") + "; recomendar con " + r.data.proveedor + ".";
}

// A qué parte del puntaje ayuda una recomendación, con los puntos de hoy.
const CRITERIOS_REC = { mercado: ["Para el mercado", 0], aceptacion: ["Para la aceptación", 1], ingreso: ["Para el ingreso", 2] };

function etiquetaCriterio(clave) {
  const def = CRITERIOS_REC[clave];
  const c = def && ((estado.veredicto || {}).criterios || [])[def[1]];
  if (!def || !c) return "";
  return `<span class="rec-criterio">${def[0]} ${puntos(c.puntos, c.maximo)}<span class="solo-lectores">, hoy ${c.puntos} de ${c.maximo}</span></span>`;
}

// "Semana 1: hacer tal cosa" → ["Semana 1", "Hacer tal cosa"]
function partirSemana(texto, i) {
  const m = /^\s*semana\s*(\d+)\s*[:.–-]\s*(.+)$/i.exec(texto || "");
  if (!m) return [`Paso ${i + 1}`, texto || ""];
  const resto = m[2].trim();
  return [`Semana ${m[1]}`, resto.charAt(0).toUpperCase() + resto.slice(1)];
}

function htmlRecomendaciones(rec) {
  const filas = (lista, conCriterio) => `<ul class="rec-filas" data-anima="lista">${lista.map((x) => `
    <li>
      <div class="rec-fila-titulo"><strong>${html(x.titulo)}</strong>${conCriterio ? etiquetaCriterio(x.criterio) : ""}</div>
      <p>${html(x.detalle)}</p>
    </li>`).join("")}</ul>`;
  const puntosLista = (lista) => `<ul data-anima="lista">${lista.map((x) => `<li>${html(x)}</li>`).join("")}</ul>`;

  const tener = rec.que_debe_tener || [];
  const esperar = rec.que_dejar_fuera || [];
  const plan = rec.plan_30_dias || [];

  return `
    ${rec.resumen ? `<div class="rec-rumbo">
      <span class="dato" data-anima="descifrar">Hacia dónde llevar el producto</span>
      <p data-anima="palabras">${html(rec.resumen)}</p>
    </div>` : ""}

    ${(rec.para_el_mercado_local || []).length ? `<div><h3>Ajustes para el mercado salvadoreño</h3>${filas(rec.para_el_mercado_local, false)}</div>` : ""}

    ${tener.length || esperar.length ? `<div class="rec-tiempos">
      ${tener.length ? `<div class="rec-ahora"><span class="dato" data-anima="descifrar">Ahora</span><h3>Lo que debe tener desde el inicio</h3>${puntosLista(tener)}</div>` : ""}
      ${esperar.length ? `<div class="rec-despues"><span class="dato" data-anima="descifrar">Después</span><h3>Lo que puede esperar</h3>${puntosLista(esperar)}</div>` : ""}
    </div>` : ""}

    ${(rec.como_mejorar_la_proyeccion || []).length ? `<div><h3>Cómo subir tu puntaje</h3>${filas(rec.como_mejorar_la_proyeccion, true)}</div>` : ""}

    ${plan.length ? `<div>
      <div class="rec-plan-titulo"><h3>Plan para los próximos 30 días</h3><span class="dato" id="rec-avance" aria-live="polite"></span></div>
      <ol class="rec-plan" data-anima="lista">${plan.map((x, i) => {
        const [semana, texto] = partirSemana(x, i);
        return `<li><button type="button" class="rec-paso" data-paso="${i}" aria-pressed="false">
          <span class="dato">${html(semana)}</span>
          <i class="rec-marca" aria-hidden="true"></i>
          <span class="rec-paso-texto">${html(texto)}</span>
        </button></li>`;
      }).join("")}</ol>
      <p class="rec-plan-ayuda">Tocá un paso cuando lo completes. Se guarda en este navegador.</p>
    </div>` : ""}

    <div class="botones"><button class="boton boton-chico boton-linea-tinta" type="button" id="btn-copiar-rec">Copiar recomendaciones</button></div>
    <p style="color:var(--tinta-suave);font-size:0.9rem">Son sugerencias de una IA a partir de tu reporte. Tomalas como punto de partida y comprobalas con personas reales.</p>`;
}

// Las recomendaciones en texto plano, para pegarlas en un documento o un chat.
function textoRecomendaciones(rec) {
  const nombre = (estado.interpretacion || {}).nombre_corto || "tu idea";
  const partes = [`Recomendaciones de gonogo para ${nombre}`];
  if (rec.resumen) partes.push(rec.resumen);
  const titulado = (titulo, lista) => { if ((lista || []).length) partes.push(titulo + "\n" + lista.map((x) => `- ${x.titulo}: ${x.detalle}`).join("\n")); };
  const simple = (titulo, lista) => { if ((lista || []).length) partes.push(titulo + "\n" + lista.map((x) => `- ${x}`).join("\n")); };
  titulado("Ajustes para el mercado salvadoreño", rec.para_el_mercado_local);
  simple("Lo que debe tener desde el inicio", rec.que_debe_tener);
  simple("Lo que puede esperar", rec.que_dejar_fuera);
  titulado("Cómo subir tu puntaje", rec.como_mejorar_la_proyeccion);
  simple("Plan para los próximos 30 días", rec.plan_30_dias);
  return partes.join("\n\n");
}

function copiarTexto(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(texto).then(() => true, () => false);
  }
  return Promise.resolve(false);
}

function activarRecomendaciones(zona, rec) {
  // --- Plan: marcar pasos como hechos (se recuerda por idea, en este navegador) ---
  const clave = "gonogo_plan_" + [...(estado.entrada || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
  let hechos = [];
  try { hechos = JSON.parse(localStorage.getItem(clave) || "[]"); } catch (e) { hechos = []; }
  if (!Array.isArray(hechos)) hechos = [];

  const pasos = Array.from(zona.querySelectorAll(".rec-paso"));
  const avance = zona.querySelector("#rec-avance");
  const refrescar = () => {
    pasos.forEach((b, i) => b.setAttribute("aria-pressed", hechos.includes(i) ? "true" : "false"));
    const n = pasos.filter((_, i) => hechos.includes(i)).length;
    if (avance) avance.textContent = `${n} de ${pasos.length} hechos`;
  };
  pasos.forEach((b, i) => b.addEventListener("click", () => {
    const yaEstaba = hechos.includes(i);
    hechos = yaEstaba ? hechos.filter((x) => x !== i) : [...hechos, i];
    b.classList.toggle("chispa", !yaEstaba);
    try { localStorage.setItem(clave, JSON.stringify(hechos)); } catch (e) { /* sin almacenamiento: solo no se recuerda */ }
    refrescar();
  }));
  refrescar();

  // --- Copiar ---
  const copiar = zona.querySelector("#btn-copiar-rec");
  if (copiar) copiar.addEventListener("click", () => {
    copiarTexto(textoRecomendaciones(rec)).then((ok) => {
      copiar.textContent = ok ? "Copiado" : "No se pudo copiar";
      setTimeout(() => { copiar.textContent = "Copiar recomendaciones"; }, 2200);
    });
  });

  if (window.GonogoAnimar) GonogoAnimar.observar(zona);
}

function bloque(titulo, trazo, etiqueta, contenido) {
  return `<section class="bloque">
    <div class="bloque-lado">
      <h2 class="subtitulo">${titulo}</h2>
      <span class="sello-firmeza ${trazo}">${etiqueta}</span>
    </div>
    <div class="bloque-cuerpo">${contenido}</div>
  </section>`;
}
