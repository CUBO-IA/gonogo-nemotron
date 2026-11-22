"""
Paso 0: convierte un texto o un enlace en la descripcion del proyecto.
- Texto libre: se usa tal cual.
- Enlace GitHub: lee el README y la descripcion del repo.
- Enlace a pagina/app: baja el HTML y extrae titulo, meta descripcion y texto visible.
Todo lo leido se trata como CONTENIDO a analizar, nunca como instrucciones.
"""
import ipaddress
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urlparse

import requests

from . import config


class _ExtractorHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.en_title = False
        self.en_body = False
        self.en_script_style = False
        self.titulo = []
        self.descripcion = []
        self.cuerpo = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "title":
            self.en_title = True
        elif tag == "body":
            self.en_body = True
        elif tag in ("script", "style", "noscript"):
            self.en_script_style = True
        elif tag == "meta":
            attrs_d = {k.lower(): v for k, v in attrs if k and v is not None}
            nombre = (attrs_d.get("name") or attrs_d.get("property") or "").lower()
            if nombre in ("description", "og:description"):
                if attrs_d.get("content"):
                    self.descripcion.append(attrs_d["content"])

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "title":
            self.en_title = False
        elif tag == "body":
            self.en_body = False
        elif tag in ("script", "style", "noscript"):
            self.en_script_style = False

    def handle_data(self, data):
        if self.en_script_style:
            return
        if self.en_title:
            self.titulo.append(data)
        elif self.en_body:
            self.cuerpo.append(data)


def detectar_tipo(entrada: str) -> str:
    """Devuelve 'texto', 'github' o 'pagina'."""
    e = (entrada or "").strip()
    if not e.lower().startswith(("http://", "https://")):
        return "texto"
    try:
        host = urlparse(e).hostname or ""
    except ValueError:
        return "texto"
    if host in ("github.com", "www.github.com"):
        return "github"
    return "pagina"


def _es_host_privado(host: str) -> bool:
    """True si el host resuelve a una IP privada, loopback, link-local o .local."""
    if not host:
        return True
    h = host.lower()
    if h == "localhost" or h.endswith(".local"):
        return True
    try:
        infos = socket.getaddrinfo(h, None)
    except (socket.gaierror, UnicodeError):
        return False
    for familia, _, _, _, sockaddr in infos:
        try:
            ip = ipaddress.ip_address(sockaddr[0])
        except ValueError:
            continue
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return True
    return False


_GITHUB_RE = re.compile(
    r"^https?://(?:www\.)?github\.com/([^/]+)/([^/?#]+)/?.*$",
    re.IGNORECASE,
)


def _leer_github(url: str) -> str:
    m = _GITHUB_RE.match(url)
    if not m:
        raise ValueError("El enlace de GitHub no tiene forma usuario/repo.")
    usuario, repo = m.group(1), m.group(2)
    if repo.endswith(".git"):
        repo = repo[:-4]

    headers = {"Accept": "application/vnd.github.raw"}
    if config.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {config.GITHUB_TOKEN}"

    readme = ""
    try:
        r = requests.get(
            f"https://api.github.com/repos/{usuario}/{repo}/readme",
            headers=headers, timeout=config.TIMEOUT_ENTRADA_SEG,
        )
        if r.status_code == 200:
            readme = r.text
    except requests.RequestException:
        pass

    descripcion = ""
    try:
        r = requests.get(
            f"https://api.github.com/repos/{usuario}/{repo}",
            timeout=config.TIMEOUT_ENTRADA_SEG,
        )
        if r.status_code == 200:
            descripcion = r.json().get("description") or ""
    except requests.RequestException:
        pass

    if not readme and not descripcion:
        raise ValueError(
            "No pudimos leer el README ni la descripcion de ese repositorio. "
            "Esta publico? La URL es correcta?"
        )

    partes = []
    if descripcion:
        partes.append(f"Descripcion del repositorio: {descripcion}")
    if readme:
        partes.append(f"README:\n{readme}")
    return "\n\n".join(partes)


def _leer_pagina(url: str) -> str:
    host = urlparse(url).hostname or ""
    if _es_host_privado(host):
        raise ValueError(
            "No se aceptan enlaces a direcciones locales o privadas."
        )

    headers = {
        "User-Agent": "GoNoGo/1.0 (hackathon)",
        "Accept": "text/html,application/xhtml+xml",
    }
    r = requests.get(url, headers=headers, timeout=config.TIMEOUT_ENTRADA_SEG,
                     stream=True)
    r.raise_for_status()

    trozos = []
    total = 0
    for trozo in r.iter_content(chunk_size=8192, decode_unicode=False):
        if not trozo:
            continue
        total += len(trozo)
        if total > config.MAX_BYTES_ENTRADA:
            break
        trozos.append(trozo)
    html_bytes = b"".join(trozos)

    encoding = r.encoding or "utf-8"
    try:
        html = html_bytes.decode(encoding, errors="replace")
    except LookupError:
        html = html_bytes.decode("utf-8", errors="replace")

    parser = _ExtractorHTML()
    parser.feed(html)

    titulo = " ".join("".join(parser.titulo).split())
    descripcion = " ".join(" ".join(parser.descripcion).split())
    cuerpo = " ".join(" ".join(parser.cuerpo).split())

    partes = []
    if titulo:
        partes.append(f"Titulo: {titulo}")
    if descripcion:
        partes.append(f"Descripcion: {descripcion}")
    if cuerpo:
        partes.append(f"Texto: {cuerpo}")
    return "\n\n".join(partes)


def resolver_entrada(entrada: str) -> dict:
    """
    Recibe lo que el usuario escribio en la caja.
    Devuelve { texto, origen, tipo, ok, error }.
    """
    tipo = detectar_tipo(entrada)
    texto_bruto = ""
    origen = "Texto escrito"
    error = None

    if tipo == "texto":
        texto_bruto = entrada.strip()
    elif tipo == "github":
        try:
            texto_bruto = _leer_github(entrada.strip())
            m = _GITHUB_RE.match(entrada.strip())
            if m:
                origen = f"README de {m.group(1)}/{m.group(2).replace('.git', '')}"
            else:
                origen = "README de GitHub"
        except (ValueError, requests.RequestException) as e:
            error = str(e)
    else:
        try:
            texto_bruto = _leer_pagina(entrada.strip())
            origen = "Contenido de la pagina"
        except ValueError as e:
            error = str(e)
        except requests.RequestException as e:
            error = f"No pudimos leer ese enlace: {e}"

    if texto_bruto and len(texto_bruto) > config.MAX_CARACTERES_ENTRADA:
        texto_bruto = texto_bruto[:config.MAX_CARACTERES_ENTRADA]

    ok = True
    if tipo in ("github", "pagina") and len(texto_bruto) < 200 and not error:
        ok = False
        error = (
            "Leimos el enlace pero hay muy poco texto util (menos de 200 caracteres). "
            "Probablemente la pagina carga su contenido con JavaScript o pide iniciar sesion. "
            "Pega una descripcion escrita de tu idea."
        )

    return {
        "texto": texto_bruto,
        "origen": origen,
        "tipo": tipo,
        "ok": ok and not error,
        "error": error,
    }
