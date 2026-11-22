"""
Carga la población y la muestra desde data/, y ofrece filtros y conteos.
Todo lo que sea "cuántas personas cumplen este perfil" vive acá.
"""
import json
from functools import lru_cache
from typing import Optional

import pandas as pd

from . import config


@lru_cache(maxsize=1)
def cargar_poblacion() -> pd.DataFrame:
    """Carga las 148,000 filas de data/poblacion.csv.gz (cacheado en memoria)."""
    if not config.RUTA_POBLACION.exists():
        raise FileNotFoundError(
            f"No existe {config.RUTA_POBLACION}. Corré scripts/preparar_datos.py"
        )
    return pd.read_csv(config.RUTA_POBLACION, compression="gzip")


@lru_cache(maxsize=1)
def cargar_catalogo() -> dict:
    """Carga data/catalogo.json: valores válidos de cada columna."""
    if not config.RUTA_CATALOGO.exists():
        raise FileNotFoundError(
            f"No existe {config.RUTA_CATALOGO}. Corré scripts/preparar_datos.py"
        )
    return json.loads(config.RUTA_CATALOGO.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def cargar_muestra() -> list[dict]:
    """Carga data/personas_muestra.json: 3,000 personas con textos."""
    if not config.RUTA_MUESTRA.exists():
        raise FileNotFoundError(
            f"No existe {config.RUTA_MUESTRA}. Corré scripts/preparar_datos.py"
        )
    return json.loads(config.RUTA_MUESTRA.read_text(encoding="utf-8"))


def datos_cargados() -> bool:
    """Para /api/salud: ¿están los tres archivos de datos en su lugar?"""
    return (
        config.RUTA_POBLACION.exists()
        and config.RUTA_CATALOGO.exists()
        and config.RUTA_MUESTRA.exists()
    )


# ---------- Filtros ----------

def _aplicar_filtro(
    df: pd.DataFrame,
    edad_min: Optional[int] = None,
    edad_max: Optional[int] = None,
    sexos: Optional[list[str]] = None,
    areas: Optional[list[str]] = None,
    niveles_educativos: Optional[list[str]] = None,
    ocupaciones: Optional[list[str]] = None,
    departamentos: Optional[list[str]] = None,
) -> pd.DataFrame:
    """Aplica un filtro. Una lista vacía o None = sin filtro en esa columna."""
    d = df
    if edad_min is not None:
        d = d[d["age"] >= edad_min]
    if edad_max is not None:
        d = d[d["age"] <= edad_max]
    if sexos:
        d = d[d["sex"].isin(sexos)]
    if areas:
        d = d[d["area"].isin(areas)]
    if niveles_educativos:
        d = d[d["education_level"].isin(niveles_educativos)]
    if ocupaciones:
        d = d[d["occupation"].isin(ocupaciones)]
    if departamentos:
        d = d[d["department"].isin(departamentos)]
    return d


def filtrar_perfil(usuario_objetivo: dict) -> tuple[pd.DataFrame, list[str]]:
    """
    Filtra la población según el usuario_objetivo.
    Si el filtro deja menos de MIN_PERSONAS_FILTRO, relaja en este orden:
      1) ocupaciones, 2) niveles educativos, 3) departamentos.
    Devuelve (dataframe_filtrado, lista_de_relajaciones_aplicadas).
    """
    df = cargar_poblacion()
    relajaciones: list[str] = []

    filtro = dict(
        edad_min=usuario_objetivo.get("edad_min"),
        edad_max=usuario_objetivo.get("edad_max"),
        sexos=usuario_objetivo.get("sexos") or None,
        areas=usuario_objetivo.get("areas") or None,
        niveles_educativos=usuario_objetivo.get("niveles_educativos") or None,
        ocupaciones=usuario_objetivo.get("ocupaciones") or None,
        departamentos=usuario_objetivo.get("departamentos") or None,
    )

    resultado = _aplicar_filtro(df, **filtro)
    if len(resultado) >= config.MIN_PERSONAS_FILTRO:
        return resultado, relajaciones

    # Relajación 1: ocupaciones
    if filtro["ocupaciones"]:
        filtro["ocupaciones"] = None
        resultado = _aplicar_filtro(df, **filtro)
        relajaciones.append("Se amplió el perfil quitando el filtro de ocupaciones.")
        if len(resultado) >= config.MIN_PERSONAS_FILTRO:
            return resultado, relajaciones

    # Relajación 2: niveles educativos
    if filtro["niveles_educativos"]:
        filtro["niveles_educativos"] = None
        resultado = _aplicar_filtro(df, **filtro)
        relajaciones.append("Se amplió el perfil quitando el filtro de educación.")
        if len(resultado) >= config.MIN_PERSONAS_FILTRO:
            return resultado, relajaciones

    # Relajación 3: departamentos
    if filtro["departamentos"]:
        filtro["departamentos"] = None
        resultado = _aplicar_filtro(df, **filtro)
        relajaciones.append("Se amplió el perfil quitando el filtro de departamentos.")

    return resultado, relajaciones


# ---------- Conteos y composición ----------

def grupo_de_edad(edad: int) -> str:
    for nombre, lo, hi in config.GRUPOS_EDAD:
        if lo <= edad <= hi:
            return nombre
    return "65+"


def composicion(df_filtrado: pd.DataFrame) -> dict:
    """Reparto del subconjunto por sexo, grupo de edad, zona, educación y hogar."""
    total = len(df_filtrado)
    if total == 0:
        return {k: [] for k in
                ["por_sexo", "por_grupo_edad", "por_area",
                 "por_educacion", "por_tipo_hogar"]}

    def _reparto(serie: pd.Series) -> list[dict]:
        vc = serie.value_counts()
        return [
            {"valor": str(k), "personas": int(v), "porcentaje": round(v / total, 4)}
            for k, v in vc.items()
        ]

    grupos_edad = df_filtrado["age"].apply(grupo_de_edad)
    return {
        "por_sexo": _reparto(df_filtrado["sex"]),
        "por_grupo_edad": _reparto(grupos_edad),
        "por_area": _reparto(df_filtrado["area"]),
        "por_educacion": _reparto(df_filtrado["education_level"]),
        "por_tipo_hogar": _reparto(df_filtrado["household_type"]),
    }


def conteo_por_departamento(df_filtrado: pd.DataFrame) -> list[dict]:
    total = len(df_filtrado)
    if total == 0:
        return []
    vc = df_filtrado["department"].value_counts()
    return [
        {"departamento": str(k), "personas": int(v),
         "porcentaje": round(v / total, 4)}
        for k, v in vc.items()
    ]


def conteo_por_municipio(df_filtrado: pd.DataFrame, top: int = 10) -> list[dict]:
    total = len(df_filtrado)
    if total == 0:
        return []
    vc = df_filtrado["municipality"].value_counts().head(top)
    return [
        {"municipio": str(k), "personas": int(v),
         "porcentaje": round(v / total, 4)}
        for k, v in vc.items()
    ]


def ocupaciones_principales(df_filtrado: pd.DataFrame, top: int = 8) -> list[dict]:
    total = len(df_filtrado)
    if total == 0:
        return []
    vc = df_filtrado["occupation"].value_counts().head(top)
    return [
        {"ocupacion": str(k), "personas": int(v),
         "porcentaje": round(v / total, 4)}
        for k, v in vc.items()
    ]


def muestra_para_simulacion(usuario_objetivo: dict, n: int) -> list[dict]:
    """
    Elige n personas de la muestra que cumplan el perfil, repartidas
    por departamento, sexo y grupo de edad. Devuelve la lista de personas.
    """
    muestra_df = pd.DataFrame(cargar_muestra())
    muestra_df["_grupo_edad"] = muestra_df["age"].apply(grupo_de_edad)

    filtro = dict(
        edad_min=usuario_objetivo.get("edad_min"),
        edad_max=usuario_objetivo.get("edad_max"),
        sexos=usuario_objetivo.get("sexos") or None,
        areas=usuario_objetivo.get("areas") or None,
        niveles_educativos=usuario_objetivo.get("niveles_educativos") or None,
        ocupaciones=usuario_objetivo.get("ocupaciones") or None,
        departamentos=usuario_objetivo.get("departamentos") or None,
    )
    sub = _aplicar_filtro(muestra_df, **filtro)

    if len(sub) < n:
        # Si el filtro deja muy poca gente en la muestra, devolvemos lo que haya.
        sub = muestra_df

    # Reparto proporcional por (department, sex, grupo_edad)
    sub = sub.copy()
    cuotas = sub.groupby(["department", "sex", "_grupo_edad"], observed=True).size()
    proporcion = cuotas / cuotas.sum()

    elegidas = []
    for clave, frac in proporcion.items():
        dep, sexo, ge = clave
        filtro_g = (
            (sub["department"] == dep)
            & (sub["sex"] == sexo)
            & (sub["_grupo_edad"] == ge)
        )
        candidatos = sub[filtro_g]
        k = max(1, int(round(frac * n)))
        elegidas.append(candidatos.head(k))

    seleccion = pd.concat(elegidas, ignore_index=True)
    if len(seleccion) > n:
        seleccion = seleccion.sample(n=n, random_state=42)
    elif len(seleccion) < n:
        faltan = n - len(seleccion)
        usados = set(seleccion["uuid"])
        extra = sub[~sub["uuid"].isin(usados)].head(faltan)
        seleccion = pd.concat([seleccion, extra], ignore_index=True)

    seleccion = seleccion.drop(columns=["_grupo_edad"], errors="ignore")
    return seleccion.to_dict(orient="records")
