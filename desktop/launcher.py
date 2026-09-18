"""Lanzador de escritorio para Café Yanaloma.

Corre la misma app FastAPI de forma local (contra la misma base de datos
Supabase) y se autoactualiza descargando el último release publicado en
GitHub. Pensado para compilarse con PyInstaller (--onefile); si se ejecuta
con `python desktop/launcher.py` (sin empaquetar) simplemente omite el
chequeo de actualización y levanta el servidor.
"""

import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

if not getattr(sys, "frozen", False):
    # en modo desarrollo (sin empaquetar), el paquete `app` vive en la raiz del repo
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

APP_NAME = "CafeYanaloma"
REPO = "fcalle2bluu/SistContCoffe"
PUERTO_PREFERIDO = 8000

CONFIG_TEMPLATE = """# Configuracion de Cafe Yanaloma (escritorio).
# Pega aqui los mismos valores que usa el servidor en la nube y guarda el archivo.
DATABASE_URL=postgresql://usuario:password@host:puerto/basededatos
SESSION_SECRET=cambia-esto-por-un-valor-secreto
"""


def carpeta_datos() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA", str(Path.home())))
    carpeta = base / APP_NAME
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta


def asegurar_configuracion(carpeta: Path) -> Path:
    config_path = carpeta / "config.env"
    if not config_path.exists():
        config_path.write_text(CONFIG_TEMPLATE, encoding="utf-8")
        print("=" * 60)
        print("Primera vez que se ejecuta en esta PC.")
        print(f"Completa la conexion a la base de datos en:\n  {config_path}")
        print("=" * 60)
        try:
            os.startfile(config_path)  # noqa: S606 - abre el .env en el editor por defecto
        except OSError:
            pass
        input("Cuando hayas guardado el archivo, presiona ENTER para continuar...")
    return config_path


def verificar_actualizacion(carpeta: Path) -> None:
    if not getattr(sys, "frozen", False):
        return  # solo aplica cuando corre como .exe empaquetado

    try:
        request = urllib.request.Request(
            f"https://api.github.com/repos/{REPO}/releases/latest",
            headers={"Accept": "application/vnd.github+json"},
        )
        with urllib.request.urlopen(request, timeout=5) as resp:
            data = json.load(resp)

        tag = data.get("tag_name", "")
        asset = next(
            (a for a in data.get("assets", []) if a.get("name") == f"{APP_NAME}.exe"),
            None,
        )
        if not tag or not asset:
            return

        version_path = carpeta / "version.txt"
        actual = version_path.read_text(encoding="utf-8").strip() if version_path.exists() else ""
        if tag == actual:
            return

        print(f"Nueva version disponible ({tag}). Descargando actualizacion...")
        exe_path = Path(sys.executable)
        nuevo_path = exe_path.with_name(f"{APP_NAME}.new.exe")
        urllib.request.urlretrieve(asset["browser_download_url"], nuevo_path)
        version_path.write_text(tag, encoding="utf-8")

        bat_path = carpeta / "actualizar.bat"
        bat_path.write_text(
            "@echo off\r\n"
            "timeout /t 1 /nobreak >nul\r\n"
            f'move /y "{nuevo_path}" "{exe_path}"\r\n'
            f'start "" "{exe_path}"\r\n'
            f'del "{bat_path}"\r\n',
            encoding="utf-8",
        )
        subprocess.Popen(
            ["cmd", "/c", str(bat_path)],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001 - nunca debe impedir arrancar la app
        print(f"No se pudo verificar actualizaciones (se continua con la version actual): {exc}")


def puerto_libre(preferido: int) -> int:
    puerto = preferido
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", puerto)) != 0:
                return puerto
        puerto += 1


def main() -> None:
    carpeta = carpeta_datos()
    config_path = asegurar_configuracion(carpeta)

    from dotenv import load_dotenv

    load_dotenv(config_path)

    verificar_actualizacion(carpeta)

    puerto = puerto_libre(PUERTO_PREFERIDO)

    import uvicorn

    from app.main import app

    def correr_servidor() -> None:
        uvicorn.run(app, host="127.0.0.1", port=puerto, log_level="info")

    hilo = threading.Thread(target=correr_servidor, daemon=True)
    hilo.start()

    time.sleep(1.5)
    webbrowser.open(f"http://127.0.0.1:{puerto}")

    print(f"Cafe Yanaloma corriendo en http://127.0.0.1:{puerto}")
    print("Deja esta ventana abierta mientras uses el sistema. Cierrala para apagarlo.")
    hilo.join()


if __name__ == "__main__":
    main()
