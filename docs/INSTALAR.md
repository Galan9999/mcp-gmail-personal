# Instalar `mcp-gmail-personal` desde cero

Guía para alguien que recibe este proyecto y quiere usar **una segunda cuenta de Gmail**
desde Claude Code, sin tocar el conector de Google que ya tiene conectado.

El conector oficial de Gmail admite **una sola cuenta**. Este servidor es código local que
arranca Claude Code como un proceso tuyo y habla el protocolo MCP por stdio. Las dos cosas
conviven: el conector sigue con la cuenta A, esto añade la cuenta B.

Hay una parte que no puede hacer nadie por ti: **las credenciales de Google son tuyas**.
Nadie te puede pasar su clave; cada persona crea la suya en 10 minutos. Es gratis.

---

## 0. Lo que necesitas antes de empezar

| Cosa | Cómo compruebas que la tienes | Si no la tienes |
|---|---|---|
| Node 22 o superior (probado con 24 y 26) | `node --version` | https://nodejs.org (versión LTS) |
| pnpm | `pnpm --version` | `npm install -g pnpm` |
| Claude Code | `claude --version` | https://claude.com/claude-code |
| `jq` (lo usa el hook del paso 5) | `jq --version` | En macOS 15 o posterior ya viene. Si no: `brew install jq`, o el gestor de paquetes de tu Linux |
| La segunda cuenta de Gmail | Saber su correo y contraseña | — |

> Si tu empresa restringe qué servidores MCP puedes añadir a Claude Code, pregunta antes a
> quien administre el espacio: esto es un MCP local, pero algunas políticas los bloquean.

---

## 1. Conseguir las credenciales de Google (la parte larga)

Estás creando **tu propia aplicación** en Google, que solo usarás tú y que solo podrá entrar
en las cuentas que tú autorices. No se publica ni la revisa nadie.

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) **con la segunda cuenta**
   (la que quieres usar desde Claude Code). Mira arriba a la derecha que es la correcta.
2. Arriba a la izquierda, selector de proyecto → **Proyecto nuevo**. Nombre: `mcp-gmail-personal`.
   Crear, y luego asegúrate de tenerlo seleccionado.
3. **APIs y servicios → Biblioteca** → busca **Gmail API** → **Habilitar**.
4. **APIs y servicios → Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Externo** → Crear.
   - Nombre de la app: `mcp-gmail-personal`. Correo de asistencia y de contacto: tu correo.
   - Guardar y continuar en *Permisos* (no hace falta añadir nada aquí).
   - En **Usuarios de prueba** → **Añadir usuarios** → pon **la dirección de la segunda cuenta**.
     Este paso es obligatorio: sin él, Google rechazará el acceso.
   - Guardar.

   > **Importante para no tener que repetir el paso 3 cada semana.** Mientras la app esté en estado
   > *Prueba* (*Testing*), Google caduca el permiso a los **7 días** y el servidor empieza a fallar con
   > `invalid_grant`. Cuando acabes la guía y compruebes que funciona, vuelve a **Pantalla de
   > consentimiento de OAuth** y pulsa **Publicar aplicación** (estado *En producción*). No hace falta
   > pasar ninguna revisión de Google: seguirá saliendo el aviso de «app no verificada», pero el permiso
   > deja de caducar. Después haz `pnpm auth` una vez más para que el token nuevo ya sea el bueno.
5. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación de escritorio**. Nombre: el que quieras.
   - Crear → **Descargar JSON**.

   > Elige **Aplicación de escritorio**, no *Aplicación web*. El tipo escritorio acepta
   > cualquier `http://localhost:<puerto>` sin declararlo, que es lo que usa el paso 3.
   > Si eliges web por error, tendrás que registrar a mano `http://localhost:4477/oauth2callback`.

6. Guarda ese JSON con este nombre exacto y en esta ruta exacta:

   ```bash
   mkdir -p ~/.config/mcp-gmail-personal
   mv ~/Downloads/client_secret_*.json ~/.config/mcp-gmail-personal/credentials.json
   ```

Ese fichero es una contraseña: **no lo subas a ningún repositorio ni lo pases por chat.**
El `.gitignore` de este proyecto ya lo bloquea, pero vive fuera del proyecto a propósito.

---

## 2. Instalar el proyecto

Pon el proyecto donde quieras tenerlo (por ejemplo `~/code/mcp-gmail-personal`): descomprime el ZIP
que te hayan pasado, o clona el repositorio con `git clone <url> ~/code/mcp-gmail-personal`. Desde esa carpeta:

```bash
pnpm install
pnpm build
```

---

## 3. Dar permiso a la cuenta

```bash
pnpm auth
```

Abre la URL que imprime **en el navegador y con la segunda cuenta**. Si tu navegador está
logueado con otra, usa una ventana de incógnito o cambia de cuenta en la pantalla de Google.

Verás un aviso de **«Google no ha verificado esta aplicación»**. Es lo esperado: la aplicación
la acabas de crear tú y no está publicada. Pulsa **Configuración avanzada → Ir a
mcp-gmail-personal (no seguro)** y acepta los permisos.

Google pide permiso para «leer, redactar, enviar y eliminar permanentemente». Conviene saber
qué significa de verdad:

- **El scope marca el techo**: lo máximo que la app *podría* hacer.
- **El código marca el suelo**: lo que hace. Aquí, las herramientas de la tabla del README,
  y la única que envía correo exige dos llamadas y un token que caduca en 5 minutos.
- El borrado permanente **no es posible**: exige el scope total `https://mail.google.com/`,
  que este servidor no pide. La papelera es reversible 30 días, como el botón de Gmail.

Al terminar, el token queda en `~/.config/mcp-gmail-personal/token.json` con permisos `0600`.
Comprueba que funciona sin pasar por Claude Code:

```bash
pnpm call list_labels '{}'
```

Si salen tus etiquetas, el servidor habla con tu Gmail.

---

## 4. Registrarlo en Claude Code

Desde la carpeta del proyecto, con la ruta absoluta de **tu** copia:

```bash
claude mcp add gmail-personal --scope user -- node "$(pwd)/dist/index.js"
```

Si Claude Code ya estaba abierto, ciérralo y vuelve a abrirlo: los servidores MCP se leen al arrancar.
Escribe `/mcp`: debe aparecer `gmail-personal` como conectado.

<details>
<summary>Si prefieres editarlo a mano</summary>

En `~/.claude.json`, dentro de `mcpServers`:

```json
"gmail-personal": {
  "type": "stdio",
  "command": "node",
  "args": ["/ruta/absoluta/a/mcp-gmail-personal/dist/index.js"],
  "env": {}
}
```
</details>

---

## 5. Protección de envíos (recomendado)

`send_email` ya pide confirmación en dos fases, y Claude Code muestra el prompt de permiso en
cada llamada incluso en los modos que no preguntan por lo demás. El hook es una segunda capa que
no depende de eso: deniega el envío en `bypassPermissions` y `dontAsk` desde tu propia máquina.
Necesita `jq` (paso 0); si falta, también deniega.

En `~/.claude/settings.json`, dentro de `hooks.PreToolUse`, añade el bloque de
[`hooks/settings-snippet.json`](../hooks/settings-snippet.json) **cambiando la ruta** por la de tu copia:

```json
{
  "matcher": "mcp__gmail-personal__send_email",
  "hooks": [
    { "type": "command", "command": "bash /ruta/absoluta/a/mcp-gmail-personal/hooks/guard-send-email.sh", "timeout": 10 }
  ]
}
```

Si tu `settings.json` todavía no tiene la clave `hooks`, el fichero entero queda así (con lo que ya
tuvieras dentro, además):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__gmail-personal__send_email",
        "hooks": [
          { "type": "command", "command": "bash /ruta/absoluta/a/mcp-gmail-personal/hooks/guard-send-email.sh", "timeout": 10 }
        ]
      }
    ]
  }
}
```

---

## 6. Tu firma y tu voz

`style/firma.html`, `style/voz.md` y `style/paleta.json` son **plantillas**. Para poner las tuyas
sin tocar lo versionado, copia cada una a su `.local` y edita ahí; el servidor prefiere el `.local`
y git lo ignora:

```bash
cp style/firma.html  style/firma.local.html
cp style/voz.md      style/voz.local.md
cp style/paleta.json style/paleta.local.json
```

`paleta.json` trae una leyenda de colores de ejemplo (etiquetas Trabajo, Viaje, Recibos…); en tu
copia `.local` pon tus etiquetas. `style/paleta.md` explica la idea.

`voz.md` se sirve a Claude con el prompt `mi_voz`: en Claude Code escribe `/mcp__gmail-personal__mi_voz`
y la sesión redactará con tu registro. La forma honesta de rellenarlo es derivarlo de correos que ya
has enviado: pide a una sesión que lea una docena con `search_emails in:sent` y saque los patrones.

---

## Cuando algo falla

| Síntoma | Qué pasa |
|---|---|
| `No encuentro las credenciales OAuth en ...` | El JSON del paso 1 no está en `~/.config/mcp-gmail-personal/credentials.json`, o se llama distinto. |
| `access_denied` al autorizar | La cuenta no está en **Usuarios de prueba** de la pantalla de consentimiento (paso 1.4). |
| El navegador se queda colgado en `localhost:4477` | Otro proceso ocupa el puerto. Ciérralo y repite `pnpm auth`. |
| Autorizaste la cuenta equivocada | `rm ~/.config/mcp-gmail-personal/token.json` y repite `pnpm auth` con la buena. |
| `invalid_grant` (funcionaba y ha dejado de funcionar) | El permiso ha caducado. Pasa a los 7 días si la app sigue en estado *Prueba* (ver la nota del paso 1.4), y también si cambiaste la contraseña de Google o revocaste el acceso. Arreglo inmediato: `rm ~/.config/mcp-gmail-personal/token.json && pnpm auth`. Para que no se repita: publicar la app. |
| El hook deniega `send_email` y dice que falta `jq` | Instala `jq` (paso 0) o cambia a un modo de permisos normal. |
| `gmail-personal` no sale en `/mcp` | ¿Hiciste `pnpm build`? La ruta registrada apunta a `dist/index.js`, que no existe sin build. |
| Falla tras actualizar el código | `pnpm install && pnpm build` otra vez, y reinicia Claude Code. |
| Quieres ver qué responde el servidor | `pnpm call <herramienta> '<json>'`, o `pnpm inspect` para el MCP Inspector. |

Para todo lo demás —qué hace cada herramienta, cómo está montado por dentro— está el
[README](../README.md).
