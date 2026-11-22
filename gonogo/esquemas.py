"""
Modelos pydantic de lo que devuelve la IA.
"""
from typing import Literal
from pydantic import BaseModel, Field, field_validator


class UsuarioObjetivo(BaseModel):
    descripcion: str = ""
    edad_min: int = Field(18, ge=18, le=100)
    edad_max: int = Field(100, ge=18, le=100)
    sexos: list[str] = Field(default_factory=list)
    areas: list[str] = Field(default_factory=list)
    niveles_educativos: list[str] = Field(default_factory=list)
    ocupaciones: list[str] = Field(default_factory=list)
    departamentos: list[str] = Field(default_factory=list)

    @field_validator("edad_max")
    @classmethod
    def edad_max_mayor(cls, v, info):
        if "edad_min" in info.data and v < info.data["edad_min"]:
            return info.data["edad_min"]
        return v


class Alcance(BaseModel):
    es_para_personas_adultas_en_el_salvador: bool = True
    es_para_empresas: bool = False
    nota: str = ""


class Interpretacion(BaseModel):
    nombre_corto: str = ""
    resumen: str = ""
    usuario_objetivo: UsuarioObjetivo = Field(default_factory=UsuarioObjetivo)
    modelo_de_ingreso: str = "suscripción"
    precio_mensual_sugerido_usd: float = Field(5.0, ge=0)
    alcance: Alcance = Field(default_factory=Alcance)

    @field_validator("modelo_de_ingreso", mode="before")
    @classmethod
    def normalizar_modelo(cls, v):
        if not isinstance(v, str):
            return "suscripción"
        v = v.strip().lower()
        mapa = {
            "suscripcion": "suscripción",
            "suscripción": "suscripción",
            "suscripción mensual": "suscripción",
            "pago unico": "pago único",
            "pago único": "pago único",
            "freemium": "freemium",
            "comision": "comisión",
            "comisión": "comisión",
            "publicidad": "publicidad",
            "gratis": "gratis",
            "free": "gratis",
        }
        return mapa.get(v, "suscripción")


class ReaccionPersona(BaseModel):
    uuid: str
    interes: Literal["alto", "medio", "bajo", "ninguno"]
    pagaria: bool
    razon: str = ""
    barrera: str = ""


class Simulacion(BaseModel):
    reacciones: list[ReaccionPersona]


class Entrevistas(BaseModel):
    a_quien: str = ""
    preguntas: list[str] = Field(default_factory=list)


class Redaccion(BaseModel):
    razones: list[str] = Field(default_factory=list)
    riesgos: list[str] = Field(default_factory=list)
    entrevistas: Entrevistas = Field(default_factory=Entrevistas)
    siguiente_paso: str = ""


class Recomendacion(BaseModel):
    titulo: str = ""
    detalle: str = ""


class Mejora(Recomendacion):
    """Una acción para subir el puntaje. 'criterio' dice a qué parte del puntaje ayuda."""
    criterio: str = ""

    @field_validator("criterio", mode="before")
    @classmethod
    def criterio_conocido(cls, v):
        # La IA a veces escribe "Aceptación simulada" o "ingresos": se lleva a una de tres claves.
        texto = str(v or "").strip().lower()
        if "merc" in texto:
            return "mercado"
        if "acep" in texto:
            return "aceptacion"
        if "ingres" in texto or "meta" in texto:
            return "ingreso"
        return ""


class Recomendaciones(BaseModel):
    resumen: str = ""
    para_el_mercado_local: list[Recomendacion] = Field(default_factory=list)
    que_debe_tener: list[str] = Field(default_factory=list)
    que_dejar_fuera: list[str] = Field(default_factory=list)
    como_mejorar_la_proyeccion: list[Mejora] = Field(default_factory=list)
    plan_30_dias: list[str] = Field(default_factory=list)
