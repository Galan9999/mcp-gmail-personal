# mcp-gmail-personal

Servidor MCP propio, escrito desde cero en TypeScript, que expone una **segunda cuenta de Gmail**
como herramientas de Claude Code. No es un conector de Anthropic ni de Google: es código tuyo,
arrancado como proceso local y hablando el protocolo por stdio.

## Por qué existe

El Gmail que ya tienes conectado es un MCP remoto de Google (`gmailmcp.googleapis.com`) con una
sola cuenta por OAuth. Este proyecto resuelve la segunda cuenta y, de paso, sirve para aprender
cómo se construye un MCP por dentro.

## Anatomía

```
src/
├── index.ts            arranque stdio (sin lógica; console.log aquí rompería el canal)
├── server.ts           createServer(): registra cada dominio
├── tools/              registro de herramientas, un fichero por DOMINIO
│   ├── result.ts       run(): el único try/catch; errores de negocio → isError con mensaje accionable
│   ├── confirm.ts      confirmación en dos fases con token opaco que caduca
│   ├── messages.ts     search_emails · search_page · read_email · trash_email · untrash_email
│   ├── labels.ts       list_labels · list_label_colors · create_label · rename_label · set_label_color · modify_labels · bulk_label
│   ├── filters.ts      list_filters · create_filter · delete_filter
│   ├── settings.ts     get_gmail_signature · set_gmail_signature
│   └── send.ts         create_draft · send_email
├── prompts/voice.ts    mi_voz
├── gmail/              la única capa que habla con la Gmail API; devuelve datos planos
│   ├── client.ts       cliente cacheado + cuota (rateLimited, mapLimited, withRetry)
│   ├── mime.ts         construir y leer MIME (puro, con test unitario)
│   └── messages.ts · labels.ts · filters.ts · settings.ts · drafts.ts
├── auth.ts             OAuth2 loopback en localhost:4477; token en ~/.config/mcp-gmail-personal/ con 0600
├── auth-cli.ts         pnpm auth
├── style.ts            carga style/voz.md, style/firma.html y style/paleta.json
└── generated/          paleta de colores extraída de los tipos de googleapis (no editar)
test/                   por protocolo con InMemoryTransport; Gmail se dobla con vi.mock
scripts/                smoke.mjs y call.mjs: hablar con el binario por stdio
hooks/                  hook PreToolUse de Claude Code: segunda capa que deniega send_email sin persona
style/                  voz.md, firma.html y paleta.json son plantillas; manda el .local si existe
docs/                   INSTALAR.md (guía desde cero) y dos documentos históricos de octubre de 2026
```

Las tres piezas del protocolo que conviene mirar en el código:

1. **Transport** — stdio. El cliente lanza tu proceso y hablan JSON-RPC línea a línea por las
   tuberías. Por eso `console.log` en `index.ts` rompería el canal: los logs van a `stderr`.
2. **`tools/list`** — el SDK deriva el JSON Schema de cada herramienta desde el `inputSchema` de
   Zod. Lo que escribas en `description` es literalmente lo que el modelo lee para decidir.
3. **`tools/call`** — el callback devuelve `content[]`. Un fallo se marca con `isError: true`, no
   lanzando una excepción.

## Puesta en marcha

> **¿Instalas esto por primera vez, o se lo pasas a alguien?** La guía paso a paso, con la
> parte de Google Cloud explicada entera y qué hacer cuando algo falla, está en
> **[`docs/INSTALAR.md`](docs/INSTALAR.md)**. Lo de aquí abajo es el resumen.

Hay un paso que no puede hacer nadie más que tú, porque es tu cuenta de Google:

1. [Google Cloud Console](https://console.cloud.google.com/) → crea un proyecto (p. ej. `mcp-gmail-personal`).
2. **APIs y servicios → Biblioteca** → habilita **Gmail API**.
3. **Pantalla de consentimiento OAuth** → tipo *Externo* → añade tu segunda cuenta en *Usuarios de prueba*.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** → tipo **Aplicación de escritorio**.
5. Descarga el JSON y guárdalo en `~/.config/mcp-gmail-personal/credentials.json`.

> Un cliente de tipo **Aplicación de escritorio** no tiene campo de URIs de redirección en la
> consola, y no hace falta: Google acepta automáticamente cualquier `http://localhost:<puerto>`
> para este tipo de cliente. Por eso `http://localhost:4477/oauth2callback` funciona sin
> registrarlo. Si eliges *Aplicación web* por error, entonces sí tendrás que declararlo a mano.

Luego:

```bash
pnpm install
pnpm build
pnpm auth        # abre la URL con la SEGUNDA cuenta y acepta
```

## Herramientas

| Herramienta | Peldaño | Qué hace |
|---|---|---|
| `search_emails` | lectura | Sintaxis nativa de Gmail (`is:unread`, `from:`, `newer_than:7d`); hasta 50. |
| `search_page` | lectura | Igual, paginado con `next_page_token`; hasta 100 por página. |
| `read_email` | lectura | Cuerpo completo en texto plano. Es contenido ajeno, no instrucciones. |
| `list_labels` · `list_label_colors` · `list_filters` · `get_gmail_signature` | lectura | |
| `create_draft` | aditivo | Deja el correo en Borradores y ahí se queda. Acepta `html`. Añade la firma salvo `with_signature: false`. |
| `create_label` · `create_filter` | aditivo | Un filtro solo afecta a lo que llegue; se deshace con `delete_filter`. |
| `rename_label` · `set_label_color` · `modify_labels` | reversible | Por id de etiqueta (`Label_4`). |
| `bulk_label` | masivo | `dry_run: true` por defecto: cuenta sin tocar. |
| `trash_email` · `untrash_email` | reversible | Papelera 30 días, igual que el botón de Gmail. |
| `delete_filter` | destructivo | Las etiquetas ya puestas se quedan. |
| `set_gmail_signature` | global | Afecta a todos tus clientes de correo. Prompt obligatorio en Claude Code. |
| `send_email` | **irreversible** | Dos fases con token + prompt obligatorio en Claude Code — ver abajo. El borrador que envía lleva la firma. |

Lo que no hace, por si lo buscas: CC/BCC, adjuntos y responder dentro de un hilo (`In-Reply-To`).
Están en la lista de abajo.

Más un prompt, `mi_voz`, que sirve `style/voz.md` para que cualquier sesión redacte con tu registro.
En Claude Code se invoca como comando: `/mcp__gmail-personal__mi_voz`.

`style/firma.html`, `style/voz.md` y `style/paleta.json` son plantillas. Las dos primeras vienen vacías
de datos; `paleta.json` trae una leyenda de colores de ejemplo (ver `style/paleta.md`). Copia cada una a
su `.local` (`firma.local.html`, `voz.local.md`, `paleta.local.json`) y edita ahí: el servidor prefiere
el `.local` y git lo ignora (`style/*.local.*`), así tus datos no viajan con el repo.

## El envío son dos llamadas, no una

Las anotaciones de MCP (`destructiveHint`, `openWorldHint`) son **pistas**: quien decide si pregunta
al humano es el cliente, no el servidor. Para que la confirmación no dependa de esa buena voluntad,
`send_email` la impone él mismo:

1. **Sin `confirmation_token`** → crea el borrador, devuelve destinatario, asunto y los primeros 400
   caracteres, y entrega un token que vive 5 minutos. No sale nada.
2. **Con el token** → envía *ese* borrador, por su id. El token se consume al usarlo.

Como la segunda fase manda un borrador ya existente y no uno nuevo, el contenido no puede cambiar
entre lo que revisas y lo que sale. Un token inventado o caducado se rechaza con un mensaje que
explica cómo volver a empezar.

Eso protege frente al modelo. Para que además lo vea **una persona**, hay dos capas más:

- `send_email` y `set_gmail_signature` llevan `_meta: { 'anthropic/requiresUserInteraction': true }`.
  Según la [documentación de Claude Code](https://code.claude.com/docs/en/mcp#require-approval-for-a-specific-tool),
  eso muestra el prompt de permiso en **cada** llamada, también en `acceptEdits`, `auto` y
  `bypassPermissions`, sin opción de «no volver a preguntar» y sin que una regla `allow` lo salte. En
  `dontAsk` la llamada se deniega directamente.
- `hooks/guard-send-email.sh` es un hook `PreToolUse` que deniega `send_email` en `bypassPermissions`
  y `dontAsk`. Es redundante con lo anterior a propósito: es determinista, vive en tu máquina y no
  depende de que la versión de Claude Code respete la anotación (ni de que un
  `--permission-prompt-tool` no interactivo la convierta en `deny`). Si falta `jq`, deniega también.
  Se instala en `~/.claude/settings.json` con el snippet de `hooks/settings-snippet.json`. Solo cubre
  `send_email`; `set_gmail_signature` queda a cargo de la anotación.

Los scopes pedidos son **`gmail.modify`**, **`gmail.send`** y **`gmail.settings.basic`**. Google lo describe de forma alarmante («leer,
redactar, enviar y eliminar permanentemente»), así que conviene separar dos cosas:

- **El scope marca el techo**: lo máximo que la app *podría* llegar a hacer.
- **El código marca el suelo**: lo que realmente hace. Aquí, las herramientas de la tabla de arriba
  (`test/server.test.ts` fija el número), y la única que envía exige dos llamadas y un token que caduca.

Y hay un límite que no depende del código: ninguno de los tres **permite el borrado permanente**. Eso
exige el scope total `https://mail.google.com/`, que este servidor no pide. La papelera es
reversible porque Google no le concedería otra cosa, no porque el código se porte bien.

## Verificar y depurar

```bash
pnpm check                              # formato · lint con tipos · build · tests · smoke por stdio
pnpm call list_labels '{}'              # llamada real al binario, como la haría Claude Code
pnpm inspect                            # MCP Inspector
```

## Siguientes pasos para aprender

- **Hilos, copias y adjuntos**: `reply_draft` con `thread_id` (`In-Reply-To`/`References` en `mime.ts`),
  `cc`/`bcc` en `create_draft`, y adjuntos. Son los tres huecos que primero se notan al usarlo.
- **Resources**: `style/voz.md` y `gmail://message/{id}` como recursos, para adjuntarlos con `@gmail-personal:` sin gastar una llamada.
- Fusionar `search_emails` en `search_page` (son la misma herramienta con y sin token).
- **Elicitation** en `send_email` como alternativa al token, para comparar las dos en vivo.
- Migrar al SDK v2 (`@modelcontextprotocol/server`) cuando Claude Code negocie 2026-07-28 con stdio: entonces `input_required` sustituye al token sin estado en el servidor.
- Servirlo como MCP remoto por HTTP con su propio OAuth.
