# gonogo

**Go or no-go, before you build.**

*intelligence for smarter decisions*

---

## Qué es GoNoGo y qué problema resuelve

Con IA, construir una app dejó de ser lo difícil. Lo que nadie le responde a quien construye es: ¿existe gente que necesite esto?, ¿cuántos son y dónde están?, ¿me alcanza ese mercado?, ¿qué tengo que comprobar antes de invertir más?

GoNoGo es una app web donde una persona describe su idea o su app en unas líneas y recibe un **reporte de realidad** sobre el mercado de **El Salvador**, que termina en un veredicto: **GO**, **NOT YET** o **NO-GO**.

Está pensada para cualquier persona que está por construir un producto digital, o que ya lo construyó.

GoNoGo evalúa la idea y su mercado. No revisa si el código funciona ni la calidad de la app.

---

## Cómo cumple las reglas del hackathon

| Regla | Cómo la cumple GoNoGo |
|---|---|
| Usar Nemotron | Usa el dataset `nvidia/Nemotron-Personas-El-Salvador` (148,000 personas sintéticas adultas) y los modelos Nemotron de NVIDIA para interpretar, simular y redactar. |
| Solo IAs gratuitas, combinando varias | Una cadena de proveedores gratuitos: Nemotron por OpenRouter, Nemotron directo por NVIDIA, Gemini y Groq. Si uno falla o se queda sin cupo, responde el siguiente. |
| Ejecutable desde GitHub | Se clona, se instalan las dependencias, se copia el archivo de claves y se corre. Los datos necesarios ya vienen en el repositorio. |
| README detallado | Este documento. |

---

## Cómo funciona (el flujo paso a paso)

1. **La idea.** La persona escribe su idea, o pega un enlace. La app acepta tres tipos de entrada:
   - **Texto:** lo usa tal cual.
   - **Enlace de GitHub** (`https://github.com/usuario/repo`): lee el README y la descripción del repositorio.
   - **Enlace a una página o app:** lee el título, la descripción y el texto visible.

   Solo acepta enlaces públicos `http` y `https`. Si de un enlace sale muy poco texto, lo avisa y pide una descripción escrita.
2. **Tu usuario.** La IA interpreta la idea y propone un perfil de usuario: descripción, rango de edad, sexo, zona (urbana o rural), educación, ocupaciones y departamentos. La persona puede **editar** ese perfil. En este mismo paso elige **cómo gana dinero** el producto (suscripción, pago único, freemium, comisión, publicidad o "todavía no sé") y escribe **su meta de ventas**, por mes o por año.
3. **Tu mercado.** Sin IA: la app filtra las 148,000 personas de Nemotron con ese perfil, calcula qué porcentaje lo cumple y lo aplica a la población de El Salvador (6,029,976 habitantes, Censo 2024). Muestra el total estimado de personas, un mapa del país por departamento, los municipios y las ocupaciones principales.
4. **Simulación.** La app elige **24 personas sintéticas** que cumplen ese perfil, repartidas por grupos de edad, de una muestra de 3,000 personas del dataset que incluye la descripción de cada una. La IA se pone en el lugar de cada persona y responde por cada una: qué tanto le interesa la idea, si pagaría y cuál es su principal barrera.
5. **Veredicto.** El **código** calcula los puntos y decide GO, NOT YET o NO-GO. La IA solo redacta las razones, los riesgos, a quién entrevistar y qué preguntarle.
6. **Reporte.** Una página con el veredicto, el retrato del usuario, el mercado, retratos de personas simuladas, la proyección de aceptación, los escenarios de ingreso frente a la meta y los próximos pasos. Tiene dos botones: **Descargar PDF** y **Crear recomendaciones**.
7. **Recomendaciones (a pedido).** La IA propone ajustes para el mercado salvadoreño, qué debe tener el producto desde el inicio, qué puede esperar, cómo subir el puntaje y un plan de 30 días por semanas. Los pasos del plan se pueden marcar como hechos. Si la IA falla o responde incompleto, aparece un botón **Volver a pedir**.

---

## Requisitos

- **Python 3.11 o superior.** Probado con Python 3.13 y 3.14.
- **Git**, para clonar el repositorio.
- **Conexión a internet**, para instalar las dependencias, para las IAs y para las tipografías.
- Un navegador web actual.
- Probado en **macOS**. En Windows no se probó; los comandos de Windows de este documento son los equivalentes estándar.

---

## Instalación y ejecución en Windows

Abrir **PowerShell** o **Símbolo del sistema** y ejecutar, uno por uno:

```
git clone https://github.com/CUBO-IA/gonogo-nemotron.git
```

```
cd gonogo-nemotron
```

```
py -m venv .venv
```

```
.venv\Scripts\python -m pip install -r requirements.txt
```

Antes de correrla, copiar dentro de esta carpeta el archivo `.env` que entrega el equipo (ver "Las claves de IA"). Después:

```
.venv\Scripts\python app.py
```

Después abrir en el navegador: `http://localhost:5050`

Notas para Windows:
- El repositorio es privado. Al clonar, Git puede pedir que se inicie sesión con una cuenta de GitHub que tenga acceso.
- Alternativa sin Git: en la página del repositorio en GitHub, botón **Code** y luego **Download ZIP**; descomprimir y entrar a esa carpeta en lugar de ejecutar los dos primeros comandos.
- Si el comando `py` no existe, usar `python` en su lugar: `python -m venv .venv`.
- No hace falta "activar" el entorno virtual: los comandos de arriba llaman directamente al Python del entorno, y así se evitan los bloqueos de scripts de PowerShell.
- Para detener la app: `Ctrl + C` en la ventana donde está corriendo.
- La instalación de dependencias puede tardar unos minutos.

---

## Instalación y ejecución en macOS o Linux

Abrir la Terminal y ejecutar, uno por uno:

```
git clone https://github.com/CUBO-IA/gonogo-nemotron.git
```

```
cd gonogo-nemotron
```

```
python3 -m venv .venv
```

```
.venv/bin/python -m pip install -r requirements.txt
```

Antes de correrla, copiar dentro de esta carpeta el archivo `.env` que entrega el equipo (ver "Las claves de IA"). Después:

```
.venv/bin/python app.py
```

Después abrir en el navegador: `http://localhost:5050`

Para detener la app: `Ctrl + C`.

### Para volver a correrla otro día

No hay que instalar de nuevo. Entrar a la carpeta del proyecto y ejecutar solo el último comando:

- Windows: `.venv\Scripts\python app.py`
- macOS o Linux: `.venv/bin/python app.py`

---

## Las claves de IA (archivo `.env`)

- Las claves **no están en el repositorio**: GitHub no permite subir claves de API. El equipo entrega por privado un archivo comprimido, `claves-gonogo.zip`, que contiene un solo archivo llamado `.env` con claves gratuitas.
- **Qué hacer con él:** descomprimirlo y copiar el archivo `.env` dentro de la carpeta del proyecto, al lado de `app.py`. No hay que crear cuentas ni configurar nada más.
- Esas claves son temporales: el equipo las dejará activas durante el periodo de evaluación.
- Las claves son de planes gratuitos y tienen cupo diario. Como referencia: el plan gratuito de OpenRouter permitía 50 consultas por día (medido el 22 de noviembre de 2026) y un análisis completo usa unas 4 consultas. Cuando un proveedor se queda sin cupo, la app pasa sola al siguiente.
- El archivo `.env.example` documenta todas las variables. Si las claves entregadas dejaran de funcionar, se pueden crear claves propias gratuitas y pegarlas en `.env`:

| Variable | Proveedor | Dónde se obtiene |
|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter (Nemotron) | https://openrouter.ai/keys |
| `NVIDIA_API_KEY` | NVIDIA (Nemotron directo) | https://build.nvidia.com |
| `GEMINI_API_KEY` | Google Gemini | https://aistudio.google.com/apikey |
| `GROQ_API_KEY` | Groq | https://console.groq.com/keys |

- Con una sola clave válida la app ya funciona. Sin ninguna, la app abre y carga los datos, pero avisa que la IA no respondió.
- Después de cambiar el archivo `.env` hay que detener la app y volver a correrla.
- Otras variables: `PORT` (puerto, por defecto 5050) y `POBLACION_SV` (opcional; por defecto 6029976, la población total del Censo 2024).

---

## Cómo usar la app

1. En `http://localhost:5050` está la página de inicio. Se puede escribir la idea ahí mismo o entrar con el botón de inicio.
2. En la pantalla de análisis, escribir la idea (o pegar un enlace) y presionar **Analizar idea**. También hay tres ejemplos listos para probar: "Plomeros y electricistas a domicilio", "Fiado para tiendas de barrio" e "Inglés para call centers".
3. Revisar el perfil de usuario que propone la IA, ajustarlo si hace falta, elegir cómo gana dinero el producto y la meta de ventas. Presionar **Continuar con este perfil**.
4. La app calcula el mercado, simula las 24 personas y arma el veredicto.
5. Leer el reporte. Al final están los botones **Descargar PDF** y **Crear recomendaciones**.

Tiempos de referencia: un análisis completo tarda entre 30 segundos y 2 minutos, según qué proveedor de IA responda. Las recomendaciones tardan unos 20 segundos más.

La app guarda las respuestas de la IA en la carpeta `data/cache/` (se crea sola). Si se analiza otra vez exactamente la misma idea, responde al instante y no gasta cupo.

---

## Cómo se calcula el veredicto

El veredicto lo decide el código, no la IA. Se suman hasta **10 puntos**:

| Criterio | Puntos máximos | Cómo se mide |
|---|---|---|
| Tamaño del mercado | 3 | Porcentaje de la población que cumple el perfil: 15% o más da 3 puntos; 5% o más, 2; 1% o más, 1. |
| Aceptación simulada | 4 | Porcentaje de aceptación entre las 24 personas simuladas: 55% o más da 4 puntos; 40% o más, 3; 25% o más, 2; 15% o más, 1. |
| Ingreso realista frente a la meta | 3 | Ingreso del escenario realista dividido entre la meta: 2 veces o más da 3 puntos; 1 vez o más, 2; la mitad o más, 1. |

- **GO:** de 8 a 10 puntos.
- **NOT YET:** de 5 a 7 puntos.
- **NO-GO:** de 0 a 4 puntos.
- **Regla de piso:** si la aceptación simulada tiene 0 puntos (menos de 15%), el veredicto es NO-GO aunque el mercado y el ingreso sumen más.

**Escenarios de ingreso.** Clientes = mercado × alcance × proporción de personas simuladas que pagarían × 1/3. El alcance es 0.5% (pesimista), 2% (realista) y 5% (optimista). El "1/3" descuenta que no todos los que dicen que pagarían terminan pagando. En los modelos de publicidad y comisión, donde la persona no paga, se cuenta a quienes mostraron interés alto o medio.

**De dónde salen las personas.** Nemotron aporta la estadística (qué proporción de la gente cumple el perfil) y esa proporción se aplica a la población total de El Salvador según el Censo 2024: 6,029,976 habitantes.

---

## IAs y datos utilizados

**Datos:** dataset `nvidia/Nemotron-Personas-El-Salvador`, 148,000 personas sintéticas adultas, calibradas con el Censo 2024. Fuente: https://huggingface.co/datasets/nvidia/Nemotron-Personas-El-Salvador

**Modelos de IA, en el orden en que la app los intenta:**

| Orden | Proveedor | Modelo |
|---|---|---|
| 1 | OpenRouter | `nvidia/nemotron-3.5-lightning:free` |
| 2 | OpenRouter (respaldo) | `nvidia/nemotron-3-ultra-550b-a55b:free` |
| 3 | NVIDIA | `nvidia/nemotron-3.5-lightning-30b-a3b` |
| 4 | Google | `gemini-3.5-flash-lite` |
| 5 | Groq | `openai/gpt-oss-120b` |

Para las recomendaciones, que son respuestas largas, después de OpenRouter se intenta primero el modelo grande de NVIDIA: `nvidia/nemotron-3-ultra-550b-a55b`.

Al pie de cada reporte, la línea "IA que respondió" dice qué proveedor y modelo contestó cada paso.

**Tecnología:** Python con Flask en el servidor; pandas y pydantic para los datos; HTML, CSS y JavaScript sin frameworks en la interfaz. El mapa de El Salvador es un dibujo propio hecho con puntos (SVG), sin librerías de mapas.

---

## Estructura del proyecto

```
gonogo-nemotron/
├── app.py                    servidor Flask y rutas de la app
├── requirements.txt          dependencias de Python
├── .env                      claves gratuitas (no viene en el repositorio: se copia aquí)
├── .env.example              plantilla con todas las variables
├── gonogo/
│   ├── config.py             configuración, escalas del veredicto y supuestos
│   ├── datos.py              carga y filtros del dataset
│   ├── entrada.py            lee el texto o el enlace que se analiza
│   ├── mercado.py            tamaño del mercado y escenarios de ingreso
│   ├── veredicto.py          la regla GO / NOT YET / NO-GO
│   ├── ia.py                 cadena de proveedores de IA y caché
│   ├── prompts.py            instrucciones que recibe la IA
│   └── esquemas.py           forma que deben tener las respuestas de la IA
├── data/
│   ├── poblacion.csv.gz      las 148,000 personas: sexo, edad, zona, educación, ocupación, municipio y departamento
│   ├── catalogo.json         valores válidos de cada dato, para armar perfiles
│   └── personas_muestra.json muestra de 3,000 personas con su descripción, para la simulación
├── scripts/
│   ├── descargar_datos.py    descarga el dataset original desde Hugging Face
│   └── preparar_datos.py     genera los tres archivos de data/
├── static/                   estilos, JavaScript e imágenes de la interfaz
├── templates/                páginas HTML (inicio y análisis)
└── logo/                     logotipos
```

---

## Regenerar los datos (opcional)

No es necesario para usar la app: los tres archivos de `data/` ya vienen en el repositorio. Quien quiera reconstruirlos desde el dataset original puede ejecutar, dentro de la carpeta del proyecto:

- Windows:
  - `.venv\Scripts\python scripts\descargar_datos.py`
  - `.venv\Scripts\python scripts\preparar_datos.py`
- macOS o Linux:
  - `.venv/bin/python scripts/descargar_datos.py`
  - `.venv/bin/python scripts/preparar_datos.py`

El primero descarga unos 542 MB a la carpeta `data/crudo/`.

---

## Problemas frecuentes

| Problema | Qué hacer |
|---|---|
| `py` o `python` no se reconoce (Windows) | Instalar Python desde https://www.python.org/downloads/ y marcar la opción "Add python.exe to PATH" durante la instalación. Cerrar y volver a abrir la terminal. |
| `git` no se reconoce | Instalar Git desde https://git-scm.com/downloads |
| Falla la instalación de dependencias | Comprobar la versión con `py --version` (Windows) o `python3 --version`. Debe ser 3.11 o superior. |
| La página no abre | Comprobar que la ventana donde corre la app siga abierta y diga que está corriendo en `http://localhost:5050`. |
| El puerto 5050 está ocupado | Abrir `.env`, cambiar `PORT=5050` por otro número (por ejemplo `PORT=5051`), volver a correr la app y abrir esa dirección. |
| "La IA no respondió" | Comprobar que el archivo `.env` esté dentro de la carpeta del proyecto, al lado de `app.py`, y que se llame exactamente `.env`. Si está, los planes gratuitos tienen cupo. Esperar un momento y volver a intentar, o usar el botón **Volver a pedir** en las recomendaciones. |
| El análisis tarda | Los planes gratuitos pueden tardar hasta 2 minutos. No hay que recargar la página. |

---

## Límites del proyecto

- Solo cubre el mercado de **El Salvador**.
- El dataset de Nemotron solo tiene **personas adultas** (18 años o más). Para productos pensados para menores, la cifra de mercado es una aproximación.
- No evalúa productos para empresas.
- El dataset no tiene datos de ingreso de las personas.
- Las personas son **sintéticas**: no son salvadoreños reales, sino perfiles creados por NVIDIA y calibrados con el Censo 2024.
- La proyección de aceptación es una **simulación** hecha por una IA: orienta, pero la demanda real se comprueba con personas reales.
- La IA puede dar resultados algo distintos entre una corrida y otra para la misma idea.
- Los escenarios de ingreso usan supuestos (alcance y conversión) que están a la vista en el reporte.

---

## Créditos y licencias

- Dataset **Nemotron-Personas-El-Salvador**, de NVIDIA, licencia CC BY 4.0: https://huggingface.co/datasets/nvidia/Nemotron-Personas-El-Salvador
- Población total de El Salvador: Censo 2024.
- Forma del mapa: límites de OpenStreetMap (vía geoBoundaries). © OpenStreetMap contributors.
- Tipografías: Host Grotesk y DM Mono, servidas por Google Fonts.

---

## Equipo

Memo Ortiz y Andrés. Proyecto de hackathon, publicado en la organización CUBO-IA de GitHub.
