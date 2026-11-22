"""
Regla del veredicto GO / NOT YET / NO-GO.

Se suman puntos (0 a 10) en tres criterios:
  - Tamaño del mercado (% de adultos)                 hasta 3 puntos
  - Aceptación simulada (puntaje de la simulación)    hasta 4 puntos
  - Ingreso mensual realista frente a la meta         hasta 3 puntos
    (los clientes salen de quienes dijeron en la simulación que pagarían)

Las escalas y los cortes viven en config.py.
El cálculo es 100% código. La IA solo redacta después, no decide.
"""
from . import config
from . import mercado as mod_mercado


def _puntos_en_escala(valor: float, escala: list[tuple[float, int]]) -> int:
    """Devuelve los puntos del primer umbral que el valor alcanza."""
    for umbral, puntos in escala:
        if valor >= umbral:
            return puntos
    return 0


def _maximo(escala: list[tuple[float, int]]) -> int:
    return max(puntos for _, puntos in escala)


def _puntos_mercado(porcentaje_de_adultos: float) -> tuple[int, str]:
    puntos = _puntos_en_escala(porcentaje_de_adultos, config.ESCALA_MERCADO)
    tamano = {3: "muy amplio", 2: "amplio", 1: "medio", 0: "chico"}[puntos]
    decimales = 1 if porcentaje_de_adultos >= 0.01 else 2
    return puntos, f"Mercado {tamano}: {porcentaje_de_adultos * 100:.{decimales}f}% de la población"


def _puntos_aceptacion(simulacion: dict) -> tuple[int, str]:
    total = int((simulacion or {}).get("total") or 0)
    if total == 0:
        return 0, "Sin simulación: la aceptación se cuenta como baja"
    puntaje = float(simulacion.get("puntaje") or 0.0)
    proyeccion = simulacion.get("proyeccion") or "baja"
    puntos = _puntos_en_escala(puntaje, config.ESCALA_ACEPTACION)
    return puntos, f"Aceptación {proyeccion}: {puntaje * 100:.0f}% en {total} personas simuladas"


def _puntos_ingreso(ingreso_realista_usd: float, meta_usd: float) -> tuple[int, str]:
    if meta_usd <= 0:
        return 1, "Sin meta mensual declarada"
    ratio = ingreso_realista_usd / meta_usd
    puntos = _puntos_en_escala(ratio, config.ESCALA_INGRESO)
    texto = {
        3: "duplica la meta o más",
        2: "cubre la meta",
        1: "cubre al menos la mitad de la meta",
        0: "cubre menos de la mitad de la meta",
    }[puntos]
    return puntos, f"El escenario realista {texto} ({ratio * 100:.0f}%)"


def tasa_de_conversion(simulacion: dict, modelo: str | None) -> dict:
    """
    Qué parte de la gente alcanzada se vuelve cliente, según la simulación.
    - Si la persona paga (suscripción, pago único, freemium): cuentan quienes dijeron que pagarían.
    - Si es gratis para quien la usa (publicidad, comisión): cuentan quienes mostraron interés.
    - Sin simulación: un supuesto fijo y conservador.
    """
    reacciones = (simulacion or {}).get("reacciones") or []
    total = len(reacciones)
    if total == 0:
        return {"tasa": config.TASA_SIN_SIMULACION, "origen": "sin_simulacion", "si": 0, "total": 0}

    interesadas = [r for r in reacciones if r.get("interes") in ("alto", "medio")]
    if modelo in config.MODELOS_SIN_PAGO:
        si, origen = len(interesadas), "usarian"
    else:
        si, origen = sum(1 for r in interesadas if r.get("pagaria")), "pagarian"
    # Del dicho al hecho: solo una parte de quienes dicen que sí termina haciéndolo.
    tasa = (si / total) * config.CUMPLIMIENTO_DE_INTENCION
    return {"tasa": tasa, "origen": origen, "si": si, "total": total}


def calcular(mercado_datos, simulacion, precio_mensual_usd, meta_mensual_usd, modelo=None):
    porcentaje = float(mercado_datos.get("porcentaje_de_adultos") or 0.0)
    conversion = tasa_de_conversion(simulacion, modelo)

    # Base para los escenarios: las personas del país que cumplen el perfil
    # (proporción de Nemotron × población de El Salvador).
    personas_estimadas = mercado_datos.get("personas_estimadas")
    if personas_estimadas is None:
        personas_estimadas = int(round(porcentaje * config.POBLACION_SV))
    base_para_escenarios = int(personas_estimadas)
    unidad = "personas"

    escenarios = mod_mercado.escenarios_de_ingreso(
        personas_mercado=base_para_escenarios,
        precio_mensual_usd=precio_mensual_usd,
        meta_mensual_usd=meta_mensual_usd,
        tasa_conversion=conversion["tasa"],
    )
    escenarios["unidad"] = unidad
    escenarios["tasa_conversion"] = round(conversion["tasa"], 4)
    escenarios["tasa_origen"] = conversion["origen"]
    escenarios["personas_que_si"] = conversion["si"]
    escenarios["personas_total"] = conversion["total"]
    escenarios["cumplimiento"] = round(config.CUMPLIMIENTO_DE_INTENCION, 4)

    # Puntos por ingreso: usamos el escenario realista
    ingreso_realista = 0.0
    for e in escenarios["escenarios"]:
        if e["nombre"] == "realista":
            ingreso_realista = e["ingreso_mensual_usd"]
            break

    p_mercado, txt_mercado = _puntos_mercado(porcentaje)
    p_aceptacion, txt_aceptacion = _puntos_aceptacion(simulacion)
    p_ingreso, txt_ingreso = _puntos_ingreso(ingreso_realista, meta_mensual_usd)

    puntos = p_mercado + p_aceptacion + p_ingreso

    if puntos >= config.VEREDICTO_GO_MIN:
        veredicto = "GO"
    elif puntos >= config.VEREDICTO_NOTYET_MIN:
        veredicto = "NOT YET"
    else:
        veredicto = "NO-GO"

    # Regla de piso: si hubo simulación y casi nadie mostró interés (0 puntos de
    # aceptación), el veredicto es NO-GO aunque el mercado sea grande. Un mercado
    # enorme que no quiere el producto no es una señal a favor.
    nota = None
    if conversion["total"] > 0 and p_aceptacion == 0 and veredicto != "NO-GO":
        veredicto = "NO-GO"
        minimo = config.ESCALA_ACEPTACION[-1][0]
        nota = (f"Los puntos darían otro resultado, pero menos del {minimo * 100:.0f}% de las personas "
                "simuladas mostró interés. Sin aceptación, el veredicto es NO-GO aunque el mercado sea grande.")

    return {
        "veredicto": veredicto,
        "nota_veredicto": nota,
        "puntos": puntos,
        "puntos_max": config.PUNTOS_MAXIMOS,
        "cortes": {"go": config.VEREDICTO_GO_MIN, "not_yet": config.VEREDICTO_NOTYET_MIN},
        "criterios": [
            {"nombre": "Tamaño del mercado", "puntos": p_mercado,
             "maximo": _maximo(config.ESCALA_MERCADO), "detalle": txt_mercado},
            {"nombre": "Aceptación simulada", "puntos": p_aceptacion,
             "maximo": _maximo(config.ESCALA_ACEPTACION), "detalle": txt_aceptacion},
            {"nombre": "Ingreso realista frente a la meta", "puntos": p_ingreso,
             "maximo": _maximo(config.ESCALA_INGRESO), "detalle": txt_ingreso},
        ],
        "escenarios": escenarios,
    }
