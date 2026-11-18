# Vigilante de cita de extranjería (renovación de huellas)

Comprueba cada 3 a 6 minutos si hay cita. Cuando hay, te envía un email y deja
el navegador abierto en la página de la cita para que termines tú la reserva.

**Hay que ejecutarlo en tu ordenador** (con conexión de casa en España). La sede
bloquea los servidores en la nube.

## Instalación (una vez)

1. Instala Python 3.10 o superior: https://www.python.org/downloads/
   (en Windows marca "Add Python to PATH").
2. Abre una terminal en esta carpeta y ejecuta:
   ```
   pip install playwright
   python -m playwright install chromium
   ```
3. Copia `config.ejemplo.ini` como `config.ini` y rellena tus datos y el email.
   Para Gmail crea una contraseña de aplicación en
   https://myaccount.google.com/apppasswords

## Probar

```
python vigilante.py --probar-email      # debe llegarte un email
python vigilante.py --listar-tramites   # copia un trozo del nombre de tu trámite en config.ini
python vigilante.py --una-vez           # recorre el formulario una vez; mira la ventana
```

## Vigilar

```
python vigilante.py
```

Déjalo corriendo con el ordenador encendido y sin suspensión. Si aparece un
captcha, resuélvelo en la ventana y el script continúa. Para pararlo, pulsa Ctrl+C.

## Notas
- No bajes la frecuencia de 3 minutos: si consultas más a menudo, la sede te bloquea.
- Si la web cambia y algún paso falla, la ventana abierta te enseña dónde se quedó.
