# mcp-gmail-personal

Servidor MCP propio, escrito desde cero en TypeScript, que expone una **segunda cuenta de Gmail**
como herramientas de Claude Code. No es un conector de Anthropic ni de Google: es código tuyo,
arrancado como proceso local y hablando el protocolo por stdio.

## Por qué existe

El Gmail que ya tienes conectado es un MCP remoto de Google (`gmailmcp.googleapis.com`) con una
sola cuenta por OAuth. Este proyecto resuelve la segunda cuenta y, de paso, sirve para aprender
cómo se construye un MCP por dentro.

## Anatomía

| Fichero | Qué hace |
|---|---|
| `src/index.ts` | El servidor MCP. Declara las 9 herramientas con `registerTool`, el prompt `mi_voz` con `registerPrompt`, y se conecta por `StdioServerTransport`. |
| `src/gmail.ts` | Envoltorio fino sobre la Gmail API. Decodifica base64url y aplana los `multipart` a texto plano. |
| `src/auth.ts` | OAuth2 con loopback en `localhost:4477`. Guarda el token en `~/.config/mcp-gmail-personal/token.json` con permisos `600`. |
| `src/auth-cli.ts` | El `pnpm auth`: abre el consentimiento una sola vez. |
| `src/style.ts` | Carga `style/voz.md` y `style/firma.html`, y deriva la firma en texto plano desde la HTML. |
| `style/voz.md` | **Editable.** Cómo escribo: idioma por interlocutor, los dos registros, qué hago siempre y qué nunca. |
| `style/firma.html` | **Editable.** Firma con estilos inline, que es lo único que Gmail respeta. |

Las tres piezas del protocolo que conviene mirar en el código:

1. **Transport** — stdio. El cliente lanza tu proceso y hablan JSON-RPC línea a línea por las
   tuberías. Por eso `console.log` en `index.ts` rompería el canal: los logs van a `stderr`.
2. **`tools/list`** — el SDK deriva el JSON Schema de cada herramienta desde el `inputSchema` de
   Zod. Lo que escribas en `description` es literalmente lo que el modelo lee para decidir.
3. **`tools/call`** — el callback devuelve `content[]`. Un fallo se marca con `isError: true`, no
   lanzando una excepción.

## Puesta en marcha

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

| Herramienta | Alcance |
|---|---|
| `search_emails` | Lectura. Sintaxis nativa de Gmail (`is:unread`, `from:`, `newer_than:7d`). |
| `read_email` | Lectura. Cuerpo completo en texto plano. |
| `list_labels` | Lectura. |
| `create_draft` | Escritura. Deja el correo en Borradores y ahí se queda: no envía. Acepta `html` para maquetarlo. |
| `trash_email` | Escritura. Mueve a la papelera, igual que el botón de borrar de Gmail. Reversible 30 días. |
| `untrash_email` | Escritura. Deshace lo anterior. |
| `send_email` | Escritura. **Envía de verdad**, en dos fases obligatorias — ver abajo. |
| `get_gmail_signature` | Lectura. La firma de los ajustes de Gmail, la que se añade sola en web y móvil. |
| `set_gmail_signature` | Escritura. La sustituye. Afecta a todo lo que envíes desde cualquier cliente. |

Más un prompt, `mi_voz`, que sirve `style/voz.md` para que cualquier sesión redacte con tu registro.

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

Los scopes pedidos son **`gmail.modify`**, **`gmail.send`** y **`gmail.settings.basic`**. Google lo describe de forma alarmante («leer,
redactar, enviar y eliminar permanentemente»), así que conviene separar dos cosas:

- **El scope marca el techo**: lo máximo que la app *podría* llegar a hacer.
- **El código marca el suelo**: lo que realmente hace. Aquí, nueve herramientas, y la única que
  envía exige dos llamadas y un token que caduca.

Y hay un límite que no depende del código: ninguno de los tres **permite el borrado permanente**. Eso
exige el scope total `https://mail.google.com/`, que este servidor no pide. La papelera es
reversible porque Google no le concedería otra cosa, no porque el código se porte bien.

## Depurar

```bash
pnpm inspect     # MCP Inspector: ver tools/list y llamar a mano
```

## Siguientes pasos para aprender

- Añadir un **resource** (`server.registerResource`) que exponga un hilo como documento.
- Paginar `search_emails` con `nextPageToken` en vez de un `max_results` tope.
- Colorear etiquetas con `users.labels.patch` — el único color de la interfaz que la API expone.
  El tema de Gmail no: `theme` no aparece ni una vez en los tipos de la API.
- Servirlo como **MCP remoto** por HTTP con su propio OAuth, que es lo que hace Google con
  `gmailmcp.googleapis.com`. Es el único camino para que exista fuera de Claude Code.
