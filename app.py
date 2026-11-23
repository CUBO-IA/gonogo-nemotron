"""
Arranque de Flask y rutas de GoNoGo.
- GET /       → home pública (marketing)
- GET /app    → dashboard (la app real)
- POST /api/* → endpoints de la app (interpretar, mercado, simular, veredicto, recomendaciones)
"""
from flask import Flask, jsonify, request, render_template, send_from_directory

from gonogo import config
from gonogo import datos
from gonogo import entrada
from gonogo import esquemas
from gonogo import ia
from gonogo import mercado
from gonogo import prompts
from gonogo import veredicto

app = Flask(__name__)


def _cifras_anuales(escenarios: dict) -> dict:
    """
    Cuando la persona piensa su meta por año, la IA debe citar cifras anuales,
    las mismas que muestra la interfaz. El cálculo sigue siendo mensual.
    """
    return {
        "aviso": "La persona definio su meta POR ANIO. Al citar ingresos o la meta usa estas cifras anuales, no las mensuales.",
        "meta_anual_usd": round(float(escenarios.get("meta_mensual_usd") or 0) * 12, 2),
        "escenarios": [
            {
                "nombre": e.get("nombre"),
                "clientes": e.get("clientes"),
                "ingreso_anual_usd": round(float(e.get("ingreso_mensual_usd") or 0) * 12, 2),
                "porcentaje_de_la_meta": e.get("porcentaje_de_la_meta"),
            }
            for e in (escenarios.get("escenarios") or [])
        ],
    }


def _pct(x) -> str:
    x = float(x or 0) * 100
    return f"{x:.1f}%" if x < 10 else f"{x:.0f}%"


def _reporte_en_claro(idea, resumen, precio, cuerpo, mercado_datos, simulacion, resultado) -> dict:
    """
    Lo que recibe la IA para redactar: los mismos números del reporte, ya escritos
    como los leería una persona (porcentajes y dólares, sin nombres técnicos).
    """
    esc = resultado["escenarios"]
    anual = cuerpo.get("periodo") == "anio"
    por, periodo = (12, "al año") if anual else (1, "al mes")

    if esc.get("tasa_origen") == "sin_simulacion":
        clientes = "No hubo simulación: se supone que 1 de cada 20 personas alcanzadas se vuelve cliente."
    else:
        verbo = "mostraron interés en usarla" if esc.get("tasa_origen") == "usarian" else "dijeron que pagarían"
        clientes = f"En la simulación, {esc.get('personas_que_si')} de {esc.get('personas_total')} personas {verbo}."
        if config.CUMPLIMIENTO_DE_INTENCION < 1:
            cada = round(1 / config.CUMPLIMIENTO_DE_INTENCION)
            clientes += f" De ellas se cuenta a 1 de cada {cada}, porque decir que sí es más fácil que hacerlo."

    return {
        "idea": idea,
        "resumen": resumen,
        "como_se_cobra": str(cuerpo.get("cobro") or "").strip()[:200] or f"USD {precio} al mes",
        "veredicto": resultado["veredicto"],
        "puntos": f"{resultado['puntos']} de {resultado['puntos_max']}",
        "regla_de_piso": resultado.get("nota_veredicto"),
        "criterios": [
            {"criterio": c["nombre"], "puntos": f"{c['puntos']} de {c['maximo']}", "detalle": c["detalle"]}
            for c in resultado["criterios"]
        ],
        "mercado": {
            "parte_de_la_poblacion_que_cumple_el_perfil": _pct(mercado_datos.get("porcentaje_de_adultos")),
            "personas_estimadas_en_el_salvador": mercado_datos.get("personas_estimadas"),
            "departamentos_con_mas_personas": [
                {"departamento": d.get("departamento"), "parte_del_mercado": _pct(d.get("porcentaje"))}
                for d in (mercado_datos.get("por_departamento") or [])[:3]
            ],
        },
        "simulacion": {
            "personas_simuladas": simulacion.get("total"),
            "con_interes_alto": simulacion.get("altos"),
            "con_interes_medio": simulacion.get("medios"),
            "aceptacion": f"{_pct(simulacion.get('puntaje'))}, proyección {simulacion.get('proyeccion')}",
            "lo_que_mas_las_frena": [
                f"{b.get('barrera')} ({b.get('veces')} veces)" for b in (simulacion.get("barreras_top") or [])
            ],
        },
        "ingreso": {
            "meta": f"vender USD {float(esc.get('meta_mensual_usd') or 0) * por:,.0f} {periodo}",
            "como_se_estiman_los_clientes": clientes,
            "escenarios": [
                {
                    "escenario": e["nombre"],
                    "llega_a": f"{_pct(e.get('alcance'))} del mercado, {e.get('personas_alcanzadas'):,} personas",
                    "clientes": e["clientes"],
                    "ventas": f"USD {e['ingreso_mensual_usd'] * por:,.0f} {periodo}",
                    "cubre_de_la_meta": f"{e['porcentaje_de_la_meta'] * 100:.0f}%",
                }
                for e in esc.get("escenarios") or []
            ],
        },
    }


# ---------- Páginas ----------

@app.get("/")
def home():
    return render_template("home.html")


@app.get("/app")
def dashboard():
    return render_template("dashboard.html")


# ---------- Logo ----------

@app.get("/logo/<path:archivo>")
def logo(archivo):
    return send_from_directory(config.RAIZ / "logo", archivo)


# ---------- Estado ----------

@app.get("/api/salud")
def salud():
    proveedores = []
    # Mismo orden en que la app las intenta (ver gonogo/ia.py)
    if config.NVIDIA_API_KEY and config.NVIDIA_MODELO:
        proveedores.append({"proveedor": "nvidia", "modelo": config.NVIDIA_MODELO})
    if config.OPENROUTER_API_KEY:
        proveedores.append({"proveedor": "openrouter", "modelo": config.OPENROUTER_MODELO})
        proveedores.append({"proveedor": "openrouter-respaldo", "modelo": config.OPENROUTER_MODELO_RESPALDO})
    if config.GEMINI_API_KEY:
        proveedores.append({"proveedor": "gemini", "modelo": config.GEMINI_MODELO})
    if config.GROQ_API_KEY and config.GROQ_MODELO:
        proveedores.append({"proveedor": "groq", "modelo": config.GROQ_MODELO})

    return jsonify({
        "estado": "ok",
        "datos_cargados": datos.datos_cargados(),
        "poblacion_pais": config.POBLACION_SV,
        "proveedores_ia": proveedores,
        "ia_configurada": len(proveedores) > 0,
    })


# ---------- Interpretar ----------

@app.post("/api/interpretar")
def api_interpretar():
    cuerpo = request.get_json(silent=True) or {}
    entrada_raw = (cuerpo.get("entrada") or "").strip()
    if not entrada_raw:
        return jsonify({"error": "Falta 'entrada'."}), 400
    if len(entrada_raw) > config.MAX_CARACTERES_IDEA and not entrada_raw.lower().startswith("http"):
        return jsonify({"error": f"El texto supera {config.MAX_CARACTERES_IDEA} caracteres."}), 400

    precio = cuerpo.get("precio_mensual_usd")
    meta = cuerpo.get("meta_mensual_usd")

    paso0 = entrada.resolver_entrada(entrada_raw)
    if not paso0["ok"]:
        return jsonify({
            "error": paso0["error"] or "No pudimos leer la entrada.",
            "paso0": paso0,
        }), 400

    idea = paso0["texto"]

    sistema, usuario = prompts.prompt_interpretar(
        idea=idea,
        catalogo=datos.cargar_catalogo(),
        precio_usd=precio,
        meta_usd=meta,
    )
    datos_ia, proveedor = ia.pedir_json(sistema, usuario, esquemas.Interpretacion)

    if datos_ia is None:
        return jsonify({
            "error": "La IA no respondio. Se muestra solo el mercado.",
            "paso0": paso0,
            "interpretacion": None,
            "proveedor": None,
        }), 200

    catalogo = datos.cargar_catalogo()
    descartados = []
    uo = datos_ia.usuario_objetivo

    def filtrar(lista, col):
        if not lista:
            return []
        validos = set(catalogo.get(col, []))
        ok_lista = []
        for v in lista:
            if v in validos:
                ok_lista.append(v)
            else:
                descartados.append(f"{col}: {v}")
        return ok_lista

    uo.sexos = filtrar(uo.sexos, "sex")
    uo.areas = filtrar(uo.areas, "area")
    uo.niveles_educativos = filtrar(uo.niveles_educativos, "education_level")
    uo.ocupaciones = filtrar(uo.ocupaciones, "occupation")
    uo.departamentos = filtrar(uo.departamentos, "department")

    return jsonify({
        "paso0": paso0,
        "interpretacion": datos_ia.model_dump(),
        "descartados": descartados,
        "proveedor": proveedor,
    })


# ---------- Mercado ----------

@app.post("/api/mercado")
def api_mercado():
    cuerpo = request.get_json(silent=True) or {}
    usuario_objetivo = cuerpo.get("usuario_objetivo")
    if not isinstance(usuario_objetivo, dict):
        return jsonify({"error": "Falta 'usuario_objetivo' (objeto)."}), 400
    return jsonify(mercado.analizar_mercado(usuario_objetivo))


# ---------- Simular ----------

@app.post("/api/simular")
def api_simular():
    cuerpo = request.get_json(silent=True) or {}
    usuario_objetivo = cuerpo.get("usuario_objetivo")
    if not isinstance(usuario_objetivo, dict):
        return jsonify({"error": "Falta 'usuario_objetivo' (objeto)."}), 400

    idea = cuerpo.get("idea") or ""
    resumen = cuerpo.get("resumen") or ""
    precio = float(cuerpo.get("precio_mensual_usd") or config.PRECIO_MENSUAL_DEFECTO_USD)

    personas = datos.muestra_para_simulacion(usuario_objetivo, config.PERSONAS_SIMULADAS)
    if len(personas) < 3:
        return jsonify({"error": "La muestra filtrada es demasiado chica."}), 400

    # Cómo se cobra, en palabras ("pago único de USD 60", "gratis con publicidad"…).
    # Si no viene, la simulación usa el precio mensual.
    cobro = str(cuerpo.get("cobro") or "").strip()[:200] or None

    sistema, usuario = prompts.prompt_simular(
        idea=idea, resumen=resumen, precio_usd=precio, personas=personas, cobro=cobro
    )
    datos_ia, proveedor = ia.pedir_json(sistema, usuario, esquemas.Simulacion)

    if datos_ia is None:
        return jsonify({
            "error": "La IA no respondio. La simulacion no esta disponible.",
            "simulacion": None,
            "proveedor": None,
        }), 200

    uuids_validos = {p["uuid"] for p in personas}
    por_uuid = {p["uuid"]: p for p in personas}
    reacciones = [r.model_dump() for r in datos_ia.reacciones if r.uuid in uuids_validos]

    # Datos básicos de cada persona, para que la interfaz pueda decir quién habla.
    campos_basicos = ("sex", "age", "department", "area", "occupation", "education_level")
    for r in reacciones:
        r["persona"] = {c: por_uuid[r["uuid"]].get(c) for c in campos_basicos}

    altos = sum(1 for r in reacciones if r["interes"] == "alto")
    medios = sum(1 for r in reacciones if r["interes"] == "medio")
    total = len(reacciones) if reacciones else 1
    puntaje = (altos * 1 + medios * 0.5) / total

    if puntaje >= config.UMBRAL_ACEPTACION_ALTA:
        proyeccion = "alta"
    elif puntaje >= config.UMBRAL_ACEPTACION_MEDIA:
        proyeccion = "media"
    else:
        proyeccion = "baja"

    def elegir(nivel):
        for r in reacciones:
            if r["interes"] == nivel:
                return {**r, "persona": por_uuid[r["uuid"]]}
        return None

    retratos = [p for p in [elegir("alto"), elegir("medio"), elegir("bajo")] if p]

    conteo_barreras = {}
    for r in reacciones:
        b = r.get("barrera", "").strip().lower()
        if b:
            conteo_barreras[b] = conteo_barreras.get(b, 0) + 1
    barreras_top = sorted(conteo_barreras.items(), key=lambda x: -x[1])[:5]

    return jsonify({
        "reacciones": reacciones,
        "puntaje": round(puntaje, 4),
        "proyeccion": proyeccion,
        "altos": altos,
        "medios": medios,
        "total": len(reacciones),
        "retratos": retratos,
        "barreras_top": [{"barrera": b, "veces": n} for b, n in barreras_top],
        "proveedor": proveedor,
    })


# ---------- Veredicto ----------

@app.post("/api/veredicto")
def api_veredicto():
    cuerpo = request.get_json(silent=True) or {}

    try:
        mercado_datos = cuerpo["mercado"]
        simulacion = cuerpo["simulacion"]
        idea = cuerpo.get("idea", "")
        resumen = cuerpo.get("resumen", "")
        precio = float(cuerpo.get("precio_mensual_usd") or config.PRECIO_MENSUAL_DEFECTO_USD)
        meta = float(cuerpo.get("meta_mensual_usd") or config.META_MENSUAL_DEFECTO_USD)
    except (KeyError, TypeError, ValueError) as e:
        return jsonify({"error": f"Faltan datos para el veredicto: {e}"}), 400

    resultado = veredicto.calcular(
        mercado_datos=mercado_datos,
        simulacion=simulacion,
        precio_mensual_usd=precio,
        meta_mensual_usd=meta,
        modelo=cuerpo.get("modelo"),
    )

    reporte_para_ia = _reporte_en_claro(
        idea=idea, resumen=resumen, precio=precio, cuerpo=cuerpo,
        mercado_datos=mercado_datos, simulacion=simulacion, resultado=resultado,
    )
    sistema, usuario = prompts.prompt_redactar(reporte_para_ia)
    redaccion, proveedor_redaccion = ia.pedir_json(sistema, usuario, esquemas.Redaccion)

    return jsonify({
        "veredicto": resultado["veredicto"],
        "puntos": resultado["puntos"],
        "puntos_max": resultado["puntos_max"],
        "cortes": resultado["cortes"],
        "nota_veredicto": resultado["nota_veredicto"],
        "criterios": resultado["criterios"],
        "escenarios": resultado["escenarios"],
        "redaccion": redaccion.model_dump() if redaccion else None,
        "proveedor_redaccion": proveedor_redaccion,
    })


# ---------- Recomendaciones ----------

@app.post("/api/recomendaciones")
def api_recomendaciones():
    """
    Recomendaciones para mejorar el producto y su proyección en el mercado local.
    Se piden aparte, cuando la persona ya vio su reporte. La IA recibe solo
    lo que el reporte ya calculó.
    """
    cuerpo = request.get_json(silent=True) or {}
    mercado_datos = cuerpo.get("mercado")
    resultado = cuerpo.get("veredicto")
    if not isinstance(mercado_datos, dict) or not isinstance(resultado, dict):
        return jsonify({"error": "Faltan 'mercado' y 'veredicto' para recomendar."}), 400

    simulacion = cuerpo.get("simulacion") if isinstance(cuerpo.get("simulacion"), dict) else {}
    usuario_objetivo = cuerpo.get("usuario_objetivo") if isinstance(cuerpo.get("usuario_objetivo"), dict) else {}
    composicion = mercado_datos.get("composicion") or {}

    # Lo que dijeron las personas: primero las más interesadas y las menos, que es donde hay señal.
    orden = {"alto": 0, "medio": 1, "bajo": 2, "ninguno": 3}
    reacciones = sorted(simulacion.get("reacciones") or [], key=lambda r: orden.get(r.get("interes"), 9))
    voces = [
        {
            "interes": r.get("interes"),
            "pagaria": r.get("pagaria"),
            "dijo": r.get("razon"),
            "barrera": r.get("barrera"),
            "quien": {k: (r.get("persona") or {}).get(k) for k in ("sex", "age", "department", "area", "occupation")},
        }
        for r in (reacciones[:5] + reacciones[-5:] if len(reacciones) > 10 else reacciones)
    ]

    reporte = {
        "idea_original": str(cuerpo.get("idea") or "")[:config.MAX_CARACTERES_ENTRADA],
        "resumen": cuerpo.get("resumen") or "",
        "como_se_cobra": str(cuerpo.get("cobro") or "").strip()[:200],
        "usuario_objetivo": usuario_objetivo,
        "veredicto": resultado.get("veredicto"),
        "puntos": resultado.get("puntos"),
        "puntos_maximos": resultado.get("puntos_max"),
        "criterios": resultado.get("criterios"),
        "escenarios_ingreso": resultado.get("escenarios"),
        "mercado": {
            "porcentaje_de_adultos": mercado_datos.get("porcentaje_de_adultos"),
            "personas_en_muestra": mercado_datos.get("personas_en_muestra"),
            "personas_estimadas": mercado_datos.get("personas_estimadas"),
            "top_departamentos": (mercado_datos.get("por_departamento") or [])[:5],
            "top_municipios": (mercado_datos.get("por_municipio") or [])[:5],
            "por_grupo_edad": composicion.get("por_grupo_edad"),
            "por_area": composicion.get("por_area"),
            "por_educacion": composicion.get("por_educacion"),
            "ocupaciones_principales": (mercado_datos.get("ocupaciones_principales") or [])[:5],
        },
        "simulacion": {
            "proyeccion": simulacion.get("proyeccion"),
            "puntaje": simulacion.get("puntaje"),
            "altos": simulacion.get("altos"),
            "medios": simulacion.get("medios"),
            "total": simulacion.get("total"),
            "barreras_top": simulacion.get("barreras_top") or [],
            "voces": voces,
        },
    }

    if cuerpo.get("periodo") == "anio" and isinstance(resultado.get("escenarios"), dict):
        reporte["cifras_anuales"] = _cifras_anuales(resultado["escenarios"])

    sistema, usuario = prompts.prompt_recomendar(reporte)
    # "de_nuevo": la persona pidió repetir la consulta, así que no sirve la respuesta guardada.
    datos_ia, proveedor = ia.pedir_json(
        sistema, usuario, esquemas.Recomendaciones,
        usar_cache=not cuerpo.get("de_nuevo"), respuesta_larga=True,
    )

    if datos_ia is None:
        return jsonify({
            "error": "La IA no respondió. Probá de nuevo en un momento.",
            "recomendaciones": None,
            "proveedor": None,
        }), 200

    return jsonify({"recomendaciones": datos_ia.model_dump(), "proveedor": proveedor})


if __name__ == "__main__":
    print(f"GoNoGo corriendo en http://localhost:{config.PORT}")
    app.run(host="127.0.0.1", port=config.PORT, debug=True)
