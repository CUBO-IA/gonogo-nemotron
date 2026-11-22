"""
Constantes y umbrales de GoNoGo en un solo lugar.
"""
from pathlib import Path
from dotenv import load_dotenv
import os

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
CACHE = DATA / "cache"

RUTA_POBLACION = DATA / "poblacion.csv.gz"
RUTA_CATALOGO = DATA / "catalogo.json"
RUTA_MUESTRA = DATA / "personas_muestra.json"

load_dotenv(RAIZ / ".env")
# Las mismas claves pueden venir en "claves.txt": un nombre visible en cualquier computadora
# (en Mac, ".env" queda oculto). Si existen los dos archivos, manda lo que diga ".env".
# "utf-8-sig" tolera el archivo si alguien lo guarda con el Bloc de notas de Windows.
load_dotenv(RAIZ / "claves.txt", encoding="utf-8-sig")

PORT = int(os.getenv("PORT", "5050"))

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODELO = os.getenv("OPENROUTER_MODELO", "nvidia/nemotron-3.5-lightning:free")
OPENROUTER_MODELO_RESPALDO = os.getenv(
    "OPENROUTER_MODELO_RESPALDO", "nvidia/nemotron-3-ultra-550b-a55b:free"
)

# Nemotron directo desde NVIDIA (build.nvidia.com). Opcional: entra cuando OpenRouter
# se queda sin cupo gratis, para que siga respondiendo Nemotron.
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_MODELO = os.getenv("NVIDIA_MODELO", "nvidia/nemotron-3.5-lightning-30b-a3b")
# Para las respuestas largas (recomendaciones): más lento, pero las entrega completas.
# Medido el 22 nov 2026: el chico dejaba secciones vacías; el grande, 3 de 3 completas en 18 a 24 s.
NVIDIA_MODELO_GRANDE = os.getenv("NVIDIA_MODELO_GRANDE", "nvidia/nemotron-3-ultra-550b-a55b")
TIMEOUT_NVIDIA_GRANDE_SEG = 60

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODELO = os.getenv("GEMINI_MODELO", "gemini-3.5-flash-lite")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODELO = os.getenv("GROQ_MODELO", "")

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

# Nemotron es la estadística: de ahí salen las proporciones, los perfiles y las
# personas simuladas. La gente es la del país: las proporciones se aplican a la
# población total de El Salvador según el Censo 2024 (6,029,976 habitantes).
# Se puede cambiar con POBLACION_SV en .env.
POBLACION_SV_CENSO_2024 = 6_029_976
_poblacion = (os.getenv("POBLACION_SV") or os.getenv("ADULTOS_SV") or "").strip()
POBLACION_SV = int(_poblacion) if _poblacion else POBLACION_SV_CENSO_2024

MIN_PERSONAS_FILTRO = 300
MAX_CARACTERES_IDEA = 2000
MAX_CARACTERES_ENTRADA = 6000
PERSONAS_SIMULADAS = 24
TIMEOUT_IA_SEG = 25
TIMEOUT_ENTRADA_SEG = 10
MAX_BYTES_ENTRADA = 2 * 1024 * 1024

# Alcance del primer año: a qué parte de su mercado llega un producto nuevo.
# Los clientes salen de: mercado × alcance × parte de la simulación que pagaría.
# Están ajustados a la población del país. Si se cambia POBLACION_SV, conviene
# volver a revisar los veredictos con scripts/calibrar.py.
ESCENARIO_PESIMISTA = 0.005
ESCENARIO_REALISTA = 0.02
ESCENARIO_OPTIMISTA = 0.05

# Del dicho al hecho: de quienes dicen en la simulación que pagarían, se cuenta
# que lo hace 1 de cada 3. Decir "sí pagaría" siempre es más fácil que pagar.
CUMPLIMIENTO_DE_INTENCION = 1 / 3

# Si no hubo simulación, se supone que 1 de cada 20 personas alcanzadas se vuelve cliente.
TASA_SIN_SIMULACION = 0.05

# Modelos en los que la persona no paga: ahí cuenta quién la usaría, no quién pagaría.
MODELOS_SIN_PAGO = ("publicidad", "comision")

META_MENSUAL_DEFECTO_USD = 1000
PRECIO_MENSUAL_DEFECTO_USD = 5

# ---------- Regla del veredicto: puntaje sobre 10 ----------
# Cada escala es una lista de (umbral, puntos), de mayor a menor.
# Se toma el primer umbral que se cumple; si no se cumple ninguno, son 0 puntos.
PUNTOS_MAXIMOS = 10

# Tamaño del mercado: parte de los adultos que cumple el perfil. Hasta 3 puntos.
ESCALA_MERCADO = [(0.15, 3), (0.05, 2), (0.01, 1)]

# Aceptación: puntaje de la simulación, de 0 a 1. Hasta 4 puntos.
ESCALA_ACEPTACION = [(0.55, 4), (0.40, 3), (0.25, 2), (0.15, 1)]

# Ingreso: escenario realista dividido entre la meta mensual. Hasta 3 puntos.
ESCALA_INGRESO = [(2.0, 3), (1.0, 2), (0.5, 1)]

# Etiqueta de la proyección de aceptación (alta / media / baja)
UMBRAL_ACEPTACION_ALTA = 0.50
UMBRAL_ACEPTACION_MEDIA = 0.25

VEREDICTO_GO_MIN = 8
VEREDICTO_NOTYET_MIN = 5

GRUPOS_EDAD = [
    ("18-24", 18, 24),
    ("25-34", 25, 34),
    ("35-44", 35, 44),
    ("45-54", 45, 54),
    ("55-64", 55, 64),
    ("65+",   65, 200),
]

COLUMNAS_CATEGORICAS = [
    "uuid", "sex", "age", "area", "education_level",
    "marital_status", "household_type", "occupation",
    "municipality", "department",
]
COLUMNAS_FILTRABLES = [
    "sex", "area", "education_level", "occupation", "department",
]
