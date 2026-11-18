#!/usr/bin/env python3
"""
Vigilante de citas de extranjería (sede ICP - cita previa).

Recorre el formulario de cita previa cada pocos minutos con tus datos y,
cuando deja de salir "no hay citas disponibles", te manda un email y deja
el navegador abierto en esa página para que termines la reserva a mano.

No resuelve captchas ni reserva por ti: si aparece un captcha, el script
espera a que lo resuelvas en la ventana del navegador.

Uso:
    python vigilante.py                # vigilar en bucle
    python vigilante.py --una-vez      # una sola comprobación (para probar)
    python vigilante.py --probar-email # solo envía un email de prueba
"""

import argparse
import configparser
import datetime as dt
import random
import smtplib
import sys
import time
from email.message import EmailMessage
from pathlib import Path

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

URL_INICIO = "https://icp.administracionelectronica.gob.es/icpplus/index.html"
SIN_CITAS = "no hay citas disponibles"
BLOQUEO = ("requested url was rejected", "too many requests", "demasiadas peticiones")
CONFIG = Path(__file__).with_name("config.ini")


def log(msg):
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def cargar_config():
    if not CONFIG.exists():
        sys.exit("Falta config.ini. Copia config.ejemplo.ini a config.ini y rellénalo.")
    cfg = configparser.ConfigParser()
    cfg.read(CONFIG, encoding="utf-8")
    return cfg


def enviar_email(cfg, asunto, cuerpo):
    e = cfg["email"]
    msg = EmailMessage()
    msg["Subject"] = asunto
    msg["From"] = e["remitente"]
    msg["To"] = e["destinatario"]
    msg.set_content(cuerpo)
    with smtplib.SMTP_SSL(e.get("smtp_host", "smtp.gmail.com"), e.getint("smtp_puerto", 465)) as s:
        s.login(e["remitente"], e["contrasena_app"])
        s.send_message(msg)
    log(f"Email enviado a {e['destinatario']}")


def texto(page):
    try:
        return page.inner_text("body").lower()
    except Exception:
        return ""


def pausa_humana(a=0.8, b=2.0):
    time.sleep(random.uniform(a, b))


def esperar_captcha(page):
    """Si hay un reCAPTCHA visible, espera a que la persona lo resuelva."""
    if page.locator("iframe[src*='recaptcha']").count() == 0:
        return
    log("Hay un captcha en la ventana del navegador: resuélvelo tú (espero hasta 5 min).")
    fin = time.time() + 300
    while time.time() < fin:
        token = page.evaluate(
            "() => { const t = document.querySelector('#g-recaptcha-response');"
            " return t ? t.value : ''; }"
        )
        if token:
            return
        time.sleep(2)
    raise RuntimeError("Captcha sin resolver")


def elegir_opcion(page, selector, buscado):
    """Selecciona en un <select> la opción cuyo texto contiene `buscado`."""
    buscado = buscado.lower()
    for sel in page.locator(selector).all():
        for opt in sel.locator("option").all():
            t = (opt.inner_text() or "").strip()
            if buscado in t.lower():
                sel.select_option(value=opt.get_attribute("value"))
                return t
    return None


def comprobar(page, cfg):
    """Devuelve 'sin_citas', 'hay_citas' o 'bloqueado'. Lanza excepción si algo falla."""
    d = cfg["datos"]

    # 1. Provincia
    page.goto(URL_INICIO, wait_until="domcontentloaded", timeout=60000)
    if any(b in texto(page) for b in BLOQUEO):
        return "bloqueado"
    prov = elegir_opcion(page, "select#form", d["provincia"])
    if not prov:
        raise RuntimeError(f"No encuentro la provincia '{d['provincia']}'")
    pausa_humana()
    page.click("#btnAceptar")
    page.wait_for_load_state("domcontentloaded")

    # 2. Trámite (puede estar en cualquiera de los grupos de la página)
    tram = elegir_opcion(page, "select[name^='tramiteGrupo']", d["tramite"])
    if not tram:
        raise RuntimeError(
            f"No encuentro un trámite que contenga '{d['tramite']}'. "
            "Ejecuta con --listar-tramites para ver los nombres exactos."
        )
    pausa_humana()
    page.click("#btnAceptar")
    page.wait_for_load_state("domcontentloaded")

    # 3. Página informativa -> Entrar
    pausa_humana()
    page.click("#btnEntrar")
    page.wait_for_load_state("domcontentloaded")

    # 4. Datos personales
    tipo = d.get("tipo_documento", "NIE").strip().upper()
    radio = {"NIE": "#rdbTipoDocNie", "PASAPORTE": "#rdbTipoDocPas", "DNI": "#rdbTipoDocDni"}.get(tipo)
    if radio and page.locator(radio).count():
        page.check(radio)
    page.fill("#txtIdCitado", d["documento"])
    page.fill("#txtDesCitado", d["nombre_completo"].upper())
    if page.locator("#txtAnnoCitado").count() and d.get("anio_nacimiento"):
        page.fill("#txtAnnoCitado", d["anio_nacimiento"])
    if page.locator("#txtPaisNac").count() and d.get("pais_nacionalidad"):
        elegir_opcion(page, "#txtPaisNac", d["pais_nacionalidad"])
    if page.locator("#txtFecha").count() and d.get("caducidad_tarjeta"):
        page.fill("#txtFecha", d["caducidad_tarjeta"])
    esperar_captcha(page)
    pausa_humana()
    page.click("#btnEnviar")
    page.wait_for_load_state("domcontentloaded")

    # 5. Solicitar cita
    pausa_humana()
    if any(b in texto(page) for b in BLOQUEO):
        return "bloqueado"
    page.click("#btnEnviar")
    page.wait_for_load_state("domcontentloaded")
    pausa_humana(1.5, 2.5)

    t = texto(page)
    if any(b in t for b in BLOQUEO):
        return "bloqueado"
    if SIN_CITAS in t:
        return "sin_citas"
    return "hay_citas"


def listar_tramites(page, cfg):
    page.goto(URL_INICIO, wait_until="domcontentloaded", timeout=60000)
    if not elegir_opcion(page, "select#form", cfg["datos"]["provincia"]):
        sys.exit("No encuentro la provincia")
    page.click("#btnAceptar")
    page.wait_for_load_state("domcontentloaded")
    for opt in page.locator("select[name^='tramiteGrupo'] option").all():
        t = opt.inner_text().strip()
        if t and not t.lower().startswith("selecciona"):
            print(" -", t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--una-vez", action="store_true", help="una sola comprobación")
    ap.add_argument("--probar-email", action="store_true", help="envía un email de prueba y sale")
    ap.add_argument("--listar-tramites", action="store_true", help="muestra los trámites de tu provincia")
    args = ap.parse_args()

    cfg = cargar_config()
    if args.probar_email:
        enviar_email(cfg, "Prueba vigilante de citas", "Si lees esto, el aviso por email funciona.")
        return

    v = cfg["vigilancia"] if cfg.has_section("vigilancia") else {}
    min_ini = float(v.get("minutos_min", 3))
    min_fin = float(v.get("minutos_max", 6))
    hora_ini = int(v.get("hora_inicio", 7))
    hora_fin = int(v.get("hora_fin", 23))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(locale="es-ES")
        page = ctx.new_page()
        page.on("dialog", lambda dlg: dlg.accept())  # la sede usa alerts de confirmación

        if args.listar_tramites:
            listar_tramites(page, cfg)
            return

        intento, fallos = 0, 0
        while True:
            hora = dt.datetime.now().hour
            if not (hora_ini <= hora < hora_fin):
                log(f"Fuera de horario ({hora_ini}h-{hora_fin}h). Duermo 15 min.")
                time.sleep(900)
                continue

            intento += 1
            espera = random.uniform(min_ini, min_fin) * 60
            try:
                estado = comprobar(page, cfg)
                fallos = 0
            except (PWTimeout, RuntimeError, Exception) as exc:  # noqa: B014
                fallos += 1
                log(f"Intento {intento}: error ({exc.__class__.__name__}: {str(exc)[:120]})")
                if "No encuentro" in str(exc):
                    sys.exit(1)
                estado = "error"
                espera = min(30, 2 ** fallos) * 60 if fallos > 2 else espera

            if estado == "sin_citas":
                log(f"Intento {intento}: sin citas.")
            elif estado == "bloqueado":
                espera = random.uniform(20, 40) * 60
                log(f"Intento {intento}: la sede nos frena. Pauso {espera/60:.0f} min.")
            elif estado == "hay_citas":
                log("¡PARECE QUE HAY CITAS! Te aviso por email. Completa la reserva en el navegador.")
                try:
                    enviar_email(
                        cfg,
                        "¡Hay cita de extranjería disponible!",
                        "El vigilante ha encontrado hueco para:\n"
                        f"  {cfg['datos']['tramite']} ({cfg['datos']['provincia']})\n\n"
                        "El navegador está abierto en la página de la cita en tu ordenador: "
                        "termina la reserva cuanto antes, los huecos vuelan.\n\n"
                        "Si no estás delante del ordenador, entra tú desde el móvil en:\n"
                        f"{URL_INICIO}\n",
                    )
                except Exception as exc:
                    log(f"No pude enviar el email: {exc}")
                if args.una_vez:
                    input("Pulsa Enter para cerrar el navegador...")
                    return
                log("Dejo el navegador quieto 15 min para que reserves; luego sigo vigilando.")
                time.sleep(900)
                continue

            if args.una_vez:
                return
            log(f"Próxima comprobación en {espera/60:.1f} min.")
            time.sleep(espera)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Parado.")
