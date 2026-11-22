"""
Descarga los 3 archivos Parquet del dataset Nemotron-Personas-El-Salvador
desde Hugging Face a data/crudo/. Si un archivo ya existe, lo salta.

Uso:
    .venv/bin/python scripts/descargar_datos.py
"""
from pathlib import Path
from huggingface_hub import hf_hub_download

REPO_ID = "nvidia/Nemotron-Personas-El-Salvador"
ARCHIVOS = [
    "data/train-00000-of-00003.parquet",
    "data/train-00001-of-00003.parquet",
    "data/train-00002-of-00003.parquet",
]

DESTINO = Path(__file__).resolve().parent.parent / "data" / "crudo"


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)

    print(f"Repositorio: {REPO_ID}")
    print(f"Destino:     {DESTINO}")
    print(f"Total:       3 archivos, ~568 MB\n")

    for nombre in ARCHIVOS:
        archivo_local = DESTINO / Path(nombre).name
        if archivo_local.exists():
            tam_mb = archivo_local.stat().st_size / (1024 * 1024)
            print(f"[saltado]  {archivo_local.name}  ({tam_mb:.1f} MB, ya existe)")
            continue

        print(f"[bajando]  {archivo_local.name} ...")
        ruta = hf_hub_download(
            repo_id=REPO_ID,
            filename=nombre,
            repo_type="dataset",
            local_dir=DESTINO,
        )
        tam_mb = Path(ruta).stat().st_size / (1024 * 1024)
        print(f"[ok]       {archivo_local.name}  ({tam_mb:.1f} MB)")

    print("\nListo.")


if __name__ == "__main__":
    main()
