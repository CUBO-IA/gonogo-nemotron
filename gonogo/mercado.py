"""
Tamaño de mercado y escenarios de ingreso.
Todo lo que sea "cuántas personas son" y "cuánto podrías facturar" vive acá.
Son cálculos en código: la IA no decide ninguno de estos números.
"""
from . import config
from . import datos


def analizar_mercado(usuario_objetivo: dict) -> dict:
    """
    Recibe el usuario_objetivo (posiblemente editado por la persona)
    y devuelve el bloque completo de mercado.
    """
    df_filtrado, relajaciones = datos.filtrar_perfil(usuario_objetivo)

    total_poblacion = len(datos.cargar_poblacion())
    personas = len(df_filtrado)
    porcentaje = personas / total_poblacion if total_poblacion else 0.0

    # La proporción sale de Nemotron; las personas, de la población del país.
    personas_estimadas = int(round(porcentaje * config.POBLACION_SV))

    return {
        "personas_en_muestra": personas,
        "total_poblacion": total_poblacion,
        "porcentaje_de_adultos": round(porcentaje, 4),
        "personas_estimadas": personas_estimadas,
        "poblacion_pais": config.POBLACION_SV,
        "por_departamento": datos.conteo_por_departamento(df_filtrado),
        "por_municipio": datos.conteo_por_municipio(df_filtrado, top=10),
        "composicion": datos.composicion(df_filtrado),
        "ocupaciones_principales": datos.ocupaciones_principales(df_filtrado, top=8),
        "relajaciones": relajaciones,
    }


def escenarios_de_ingreso(
    personas_mercado: int,
    precio_mensual_usd: float,
    meta_mensual_usd: float,
    tasa_conversion: float = 1.0,
) -> dict:
    """
    Tres escenarios de ingreso. En cada uno:
        clientes = mercado × alcance × tasa_conversion
    - alcance: a qué parte del mercado se llega en el primer año (pesimista, realista, optimista).
    - tasa_conversion: qué parte de la gente alcanzada se vuelve cliente. Sale de la
      simulación (quienes dijeron que pagarían), así una idea que nadie pagaría no
      "cubre la meta" solo porque su mercado es grande.
    El mercado llega en personas del país: la proporción de Nemotron aplicada a la
    población de El Salvador.
    """
    base = personas_mercado
    escenarios = []
    for nombre, alcance in (
        ("pesimista", config.ESCENARIO_PESIMISTA),
        ("realista", config.ESCENARIO_REALISTA),
        ("optimista", config.ESCENARIO_OPTIMISTA),
    ):
        alcanzadas = int(round(base * alcance))
        clientes = int(round(base * alcance * tasa_conversion))
        ingreso = round(clientes * precio_mensual_usd, 2)
        cubre = ingreso / meta_mensual_usd if meta_mensual_usd else 0.0
        escenarios.append({
            "nombre": nombre,
            "alcance": alcance,
            "personas_alcanzadas": alcanzadas,
            "clientes": clientes,
            "ingreso_mensual_usd": ingreso,
            "porcentaje_de_la_meta": round(cubre, 4),
        })
    return {
        "precio_mensual_usd": precio_mensual_usd,
        "meta_mensual_usd": meta_mensual_usd,
        "escenarios": escenarios,
    }
