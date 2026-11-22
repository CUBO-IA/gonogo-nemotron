"""
Lee los 3 Parquet de data/crudo/ y genera:
    data/poblacion.csv.gz        las 148,000 personas, solo columnas categóricas
    data/catalogo.json           valores únicos de cada columna categórica
    data/personas_muestra.json   muestra estratificada de ~3,000 personas con textos

Uso:
    .venv/bin/python scripts/preparar_datos.py
"""
import gzip
import json
from pathlib import Path

import pandas as pd

SEMILLA = 20261121
N_MUESTRA = 3000

RAIZ = Path(__file__).resolve().parent.parent
CRUDO = RAIZ / "data" / "crudo"
DATA = RAIZ / "data"

COLUMNAS_CATEGORICAS = [
    "uuid",
    "sex",
    "age",
    "area",
    "education_level",
    "marital_status",
    "household_type",
    "occupation",
    "municipality",
    "department",
]

COLUMNAS_TEXTO_MUESTRA = [
    "persona",
    "professional_persona",
    "career_goals_and_ambitions",
]


def grupo_edad(edad: int) -> str:
    if edad < 25:
        return "18-24"
    if edad < 35:
        return "25-34"
    if edad < 45:
        return "35-44"
    if edad < 55:
        return "45-54"
    if edad < 65:
        return "55-64"
    return "65+"


def main() -> None:
    archivos = sorted(CRUDO.glob("*.parquet"))
    if not archivos:
        raise SystemExit(
            f"No hay Parquet en {CRUDO}. Corré primero scripts/descargar_datos.py"
        )

    print(f"Leyendo {len(archivos)} archivo(s) Parquet de {CRUDO} ...")
    df = pd.concat([pd.read_parquet(a) for a in archivos], ignore_index=True)
    print(f"Filas totales: {len(df):,}")

    # 1) poblacion.csv.gz
    poblacion = df[COLUMNAS_CATEGORICAS].copy()
    ruta_pob = DATA / "poblacion.csv.gz"
    poblacion.to_csv(ruta_pob, index=False, compression="gzip")

    # 2) catalogo.json
    catalogo = {}
    for col in COLUMNAS_CATEGORICAS:
        if col in ("uuid", "age"):
            continue
        valores = sorted(poblacion[col].dropna().astype(str).unique().tolist())
        catalogo[col] = valores
    ruta_cat = DATA / "catalogo.json"
    ruta_cat.write_text(
        json.dumps(catalogo, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 3) personas_muestra.json (estratificada por departamento, sexo y grupo de edad)
    df_m = df.copy()
    df_m["_grupo_edad"] = df_m["age"].apply(grupo_edad)
    cuotas = df_m.groupby(["department", "sex", "_grupo_edad"], observed=True).size()
    proporcion = cuotas / cuotas.sum()

    rng = pd.Series(range(len(df_m))).sample(frac=1, random_state=SEMILLA).index
    df_shuffled = df_m.loc[rng]

    # Tomamos por estrato la parte proporcional, redondeando hacia abajo
    # y completando hasta N_MUESTRA con el resto en orden aleatorio.
    seleccion = []
    for clave, frac in proporcion.items():
        dep, sexo, ge = clave
        filtro = (
            (df_shuffled["department"] == dep)
            & (df_shuffled["sex"] == sexo)
            & (df_shuffled["_grupo_edad"] == ge)
        )
        candidatos = df_shuffled[filtro]
        n = max(1, int(round(frac * N_MUESTRA)))
        n = min(n, len(candidatos))
        seleccion.append(candidatos.head(n))

    muestra = pd.concat(seleccion, ignore_index=True)
    if len(muestra) > N_MUESTRA:
        muestra = muestra.sample(n=N_MUESTRA, random_state=SEMILLA).reset_index(drop=True)
    elif len(muestra) < N_MUESTRA:
        faltan = N_MUESTRA - len(muestra)
        extra = df_shuffled.drop(muestra.index, errors="ignore").head(faltan)
        muestra = pd.concat([muestra, extra], ignore_index=True)

    cols_salida = COLUMNAS_CATEGORICAS + COLUMNAS_TEXTO_MUESTRA
    personas = muestra[cols_salida].to_dict(orient="records")
    ruta_muestra = DATA / "personas_muestra.json"
    ruta_muestra.write_text(
        json.dumps(personas, ensure_ascii=False), encoding="utf-8"
    )

    # Resumen
    print("\n=== Resumen ===")
    print(f"Filas:                 {len(df):,}")
    print(f"poblacion.csv.gz:      {ruta_pob.stat().st_size / (1024*1024):.2f} MB")
    print(f"catalogo.json:         {ruta_cat.stat().st_size / (1024*1024):.2f} MB")
    print(f"personas_muestra.json: {ruta_muestra.stat().st_size / (1024*1024):.2f} MB")
    print(f"Personas en muestra:   {len(personas):,}")
    print("\nConteo por departamento:")
    print(poblacion["department"].value_counts().to_string())
    print("\nConteo por sexo:")
    print(poblacion["sex"].value_counts().to_string())
    print("\nConteo por área:")
    print(poblacion["area"].value_counts().to_string())


if __name__ == "__main__":
    main()
