"""
Cadena de proveedores de IA gratuitos con cache en disco.
"""
import hashlib
import json
from pathlib import Path
from typing import Optional

import requests
from pydantic import ValidationError

from . import config


def _hash_prompt(sistema: str, usuario: str) -> str:
    h = hashlib.sha256()
    h.update(sistema.encode("utf-8"))
    h.update(b"\n---\n")
    h.update(usuario.encode("utf-8"))
    return h.hexdigest()


def _ruta_cache(hash_prompt: str) -> Path:
    config.CACHE.mkdir(parents=True, exist_ok=True)
    return config.CACHE / f"{hash_prompt}.json"


def _leer_cache(hash_prompt: str) -> Optional[dict]:
    ruta = _ruta_cache(hash_prompt)
    if ruta.exists():
        try:
            return json.loads(ruta.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None
    return None


def _escribir_cache(hash_prompt: str, proveedor: str, datos: dict) -> None:
    ruta = _ruta_cache(hash_prompt)
    try:
        ruta.write_text(
            json.dumps({"proveedor": proveedor, "datos": datos}, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError:
        pass


def extraer_json(texto: str) -> Optional[dict]:
    if not texto:
        return None
    limpio = texto.strip()
    if "```" in limpio:
        partes = limpio.split("```")
        for parte in partes:
            candidato = parte.strip()
            if candidato.startswith("json"):
                candidato = candidato[4:].strip()
            if candidato.startswith("{") or candidato.startswith("["):
                limpio = candidato
                break
    try:
        return json.loads(limpio)
    except json.JSONDecodeError:
        pass
    inicio = limpio.find("{")
    if inicio == -1:
        return None
    profundidad = 0
    en_string = False
    escape = False
    for i in range(inicio, len(limpio)):
        c = limpio[i]
        if en_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == '"':
                en_string = False
        else:
            if c == '"':
                en_string = True
            elif c == "{":
                profundidad += 1
            elif c == "}":
                profundidad -= 1
                if profundidad == 0:
                    candidato = limpio[inicio:i + 1]
                    try:
                        return json.loads(candidato)
                    except json.JSONDecodeError:
                        return None
    return None


def _llamar_openrouter(sistema, usuario, modelo, api_key):
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    cuerpo = {
        "model": modelo,
        "messages": [
            {"role": "system", "content": sistema},
            {"role": "user", "content": usuario},
        ],
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
    }
    r = requests.post(url, headers=headers, json=cuerpo, timeout=config.TIMEOUT_IA_SEG)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _llamar_gemini(sistema, usuario, modelo, api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    cuerpo = {
        "systemInstruction": {"parts": [{"text": sistema}]},
        "contents": [{"role": "user", "parts": [{"text": usuario}]}],
        "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json"},
    }
    r = requests.post(url, headers=headers, json=cuerpo, timeout=config.TIMEOUT_IA_SEG)
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


def _llamar_groq(sistema, usuario, modelo, api_key):
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    cuerpo = {
        "model": modelo,
        "messages": [
            {"role": "system", "content": sistema},
            {"role": "user", "content": usuario},
        ],
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
    }
    r = requests.post(url, headers=headers, json=cuerpo, timeout=config.TIMEOUT_IA_SEG)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _llamar_nvidia(sistema, usuario, modelo, api_key, esquema=None, espera=None):
    """Nemotron servido por NVIDIA (API compatible con la de OpenAI)."""
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    cuerpo = {
        "model": modelo,
        "messages": [
            {"role": "system", "content": sistema},
            {"role": "user", "content": usuario},
        ],
        "temperature": 0.4,
        "max_tokens": 4096,
        # Sin esto el modelo gasta toda la respuesta "pensando" y no llega a escribir el JSON
        # (medido: 20 s y respuesta vacía; con el razonamiento apagado, 1.4 s y JSON válido).
        "chat_template_kwargs": {"enable_thinking": False},
    }
    if esquema is not None:
        # Con la estructura obligatoria el JSON siempre llega bien formado
        # (sin ella, 4 de 6 respuestas largas venían con corchetes mal cerrados).
        cuerpo["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "respuesta", "schema": esquema.model_json_schema()},
        }
    r = requests.post(url, headers=headers, json=cuerpo, timeout=espera or config.TIMEOUT_IA_SEG)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _proveedores_disponibles(esquema=None, respuesta_larga=False):
    cadena = []
    # Primero Nemotron directo desde NVIDIA: responde en segundos. OpenRouter sirve los mismos
    # modelos gratis pero con cola (una simulación llegó a tardar 2 minutos), así que queda de respaldo.
    # Los nombres de los modelos de NVIDIA ya empiezan con "nvidia/": se muestran tal cual al pie del reporte.
    if respuesta_larga and config.NVIDIA_API_KEY and config.NVIDIA_MODELO_GRANDE:
        cadena.append((
            config.NVIDIA_MODELO_GRANDE,
            lambda s, u: _llamar_nvidia(s, u, config.NVIDIA_MODELO_GRANDE, config.NVIDIA_API_KEY,
                                        esquema, config.TIMEOUT_NVIDIA_GRANDE_SEG),
        ))
    if config.NVIDIA_API_KEY and config.NVIDIA_MODELO:
        cadena.append((
            config.NVIDIA_MODELO,
            lambda s, u: _llamar_nvidia(s, u, config.NVIDIA_MODELO, config.NVIDIA_API_KEY, esquema),
        ))
    if config.OPENROUTER_API_KEY:
        cadena.append((
            f"openrouter/{config.OPENROUTER_MODELO}",
            lambda s, u: _llamar_openrouter(s, u, config.OPENROUTER_MODELO, config.OPENROUTER_API_KEY),
        ))
        if config.OPENROUTER_MODELO_RESPALDO:
            cadena.append((
                f"openrouter/{config.OPENROUTER_MODELO_RESPALDO}",
                lambda s, u: _llamar_openrouter(s, u, config.OPENROUTER_MODELO_RESPALDO, config.OPENROUTER_API_KEY),
            ))
    if config.GEMINI_API_KEY:
        cadena.append((
            f"gemini/{config.GEMINI_MODELO}",
            lambda s, u: _llamar_gemini(s, u, config.GEMINI_MODELO, config.GEMINI_API_KEY),
        ))
    if config.GROQ_API_KEY and config.GROQ_MODELO:
        cadena.append((
            f"groq/{config.GROQ_MODELO}",
            lambda s, u: _llamar_groq(s, u, config.GROQ_MODELO, config.GROQ_API_KEY),
        ))
    return cadena


def pedir_json(sistema, usuario, esquema, usar_cache=True, respuesta_larga=False):
    """
    usar_cache=False vuelve a preguntarle a la IA aunque haya una respuesta guardada.
    respuesta_larga=True prueba primero el Nemotron grande de NVIDIA (para las recomendaciones).
    """
    hash_prompt = _hash_prompt(sistema, usuario)
    cacheado = _leer_cache(hash_prompt) if usar_cache else None
    if cacheado is not None:
        try:
            datos = esquema.model_validate(cacheado["datos"])
            print(f"[ia] cache -> {cacheado.get('proveedor', '?')}")
            return datos, cacheado.get("proveedor")
        except ValidationError:
            pass

    cadena = _proveedores_disponibles(esquema, respuesta_larga)
    if not cadena:
        print("[ia] no hay proveedores configurados")
        return None, None

    for nombre, funcion in cadena:
        print(f"[ia] intentando {nombre} ...")
        try:
            texto = funcion(sistema, usuario)
        except requests.Timeout:
            print(f"[ia] timeout en {nombre}")
            continue
        except requests.HTTPError as e:
            print(f"[ia] HTTP error en {nombre}: {e}")
            continue
        except Exception as e:
            print(f"[ia] error en {nombre}: {e}")
            continue

        bruto = extraer_json(texto)
        if bruto is None:
            print(f"[ia] {nombre} devolvio texto sin JSON")
            continue

        try:
            datos = esquema.model_validate(bruto)
        except ValidationError as e:
            print(f"[ia] {nombre} JSON no valida: {e.errors()[:3]}")
            continue

        _escribir_cache(hash_prompt, nombre, datos.model_dump())
        print(f"[ia] ok con {nombre}")
        return datos, nombre

    print("[ia] todos los proveedores fallaron")
    return None, None
