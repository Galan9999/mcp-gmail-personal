# Prompt para un chat de investigación

Copia todo lo que hay bajo la línea en un chat nuevo. Está escrito para que la respuesta sea
accionable sobre este proyecto concreto, no un artículo genérico sobre MCP.

---

Necesito que investigues y me des recomendaciones fundamentadas para estructurar un servidor MCP en
TypeScript que ya funciona pero que ha crecido sin criterio. Quiero convertirlo en un proyecto
ordenado y poder seguir ampliándolo sin que se degrade.

## Qué es el proyecto

Un servidor MCP propio que expone una segunda cuenta de Gmail como herramientas de Claude Code.
Transporte stdio, proceso local, registrado con `claude mcp add --scope user`. No es un conector de
proveedor: el código es mío. Lo uso además para aprender cómo se construye un MCP por dentro.

## Estado real, medido hoy

```
src/index.ts          528 líneas   19 registerTool + 1 registerPrompt + 0 registerResource
src/gmail.ts          403 líneas   envoltorio sobre la Gmail API + limitador de cuota
src/generated/        116 líneas   paleta de colores extraída de los tipos de googleapis
src/auth.ts            92 líneas   OAuth2 loopback + persistencia del token
src/style.ts           42 líneas   carga de ficheros de estilo
src/auth-cli.ts         7 líneas
style/                              voz.md, firma.html, paleta.json, paleta.md
```

Dependencias: `@modelcontextprotocol/sdk` 1.31, `googleapis` 182, `google-auth-library` 11, `zod` 4.
TypeScript 7, `module: Node16`, `strict` + `noUncheckedIndexedAccess`. pnpm. Node 26.
Scripts: `build`, `dev`, `auth`, `inspect`. **No hay linter, ni formateador, ni tests, ni CI.**

Las 19 herramientas: search_emails, search_page, read_email, list_labels, create_label,
rename_label, set_label_color, list_label_colors, modify_labels, bulk_label, create_draft,
send_email, trash_email, untrash_email, get_gmail_signature, set_gmail_signature, list_filters,
create_filter, delete_filter.

## Lo que necesito que investigues

Responde a las seis preguntas por separado. **Cita fuentes** y distingue siempre entre lo que dice
la documentación oficial del Model Context Protocol y lo que es convención de la comunidad o
preferencia tuya. Si algo no está establecido, dilo en vez de inventar una norma.

**1. Arquitectura de ficheros.** ¿Cuál es la forma recomendada de organizar un servidor MCP con ~20
herramientas? Un fichero por herramienta, agrupación por dominio, un registro central, otra cosa.
Busca cómo lo resuelven los servidores de referencia del repositorio oficial
`modelcontextprotocol/servers` y algún servidor maduro de terceros. Quiero ver estructura de
carpetas concreta, no principios abstractos. Explica también dónde debe vivir la capa que habla con
la API externa y cómo se separa de la capa que registra herramientas.

**2. Convenciones de nombres.** Nombres de herramientas (¿`search_emails` o `gmail_search_emails`?
¿importa el prefijo cuando conviven varios servidores con herramientas homónimas?), nombres de
parámetros, nombres de fichero, y cómo escribir las `description` sabiendo que son lo que el modelo
lee para decidir. ¿Hay guía oficial sobre longitud y estilo de esas descripciones?

**3. Anotaciones y seguridad.** `readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`: qué significan exactamente, quién las respeta y quién no. Y la pregunta de fondo:
si las anotaciones son solo pistas que el cliente puede ignorar, ¿cuál es el patrón recomendado para
una operación irreversible? En este servidor implementé confirmación en dos fases con token que
caduca (primera llamada previsualiza, segunda ejecuta). Quiero saber si eso es un patrón reconocido,
si tiene nombre, y si hay alternativas mejores.

**4. Tests.** ¿Cómo se prueba un servidor MCP? Me interesan los dos niveles: probar los handlers
como funciones, y probar el servidor de verdad por el protocolo. ¿Existe un cliente de test en el
SDK oficial, o la práctica es levantar el proceso y hablarle JSON-RPC por stdio? ¿Cómo se doblan
las llamadas a una API externa como Gmail? Dame un ejemplo de test concreto.

**5. Linter, formateador y calidad.** Configuración recomendada para un proyecto TypeScript pequeño
y moderno en 2026: ESLint (¿flat config?), Prettier o alternativa, reglas que de verdad aporten algo
aquí, y si tiene sentido un límite de líneas por fichero como regla automática. Quiero ficheros bajo
control, no un `index.ts` de 528 líneas, pero no quiero burocracia para un proyecto personal.

**6. CLAUDE.md.** Esto es lo más importante. Quiero un `CLAUDE.md` que haga que Claude Code programe
bien en este repo sin que yo repita las mismas instrucciones cada sesión. Investiga qué hace bueno a
un CLAUDE.md según la documentación de Anthropic y según la experiencia publicada, y luego
**escríbeme uno completo y listo para pegar**, adaptado a este proyecto. Que cubra al menos: cómo se
añade una herramienta nueva, dónde va cada cosa, qué está prohibido, cómo se verifica un cambio
antes de darlo por bueno, y cómo se tratan los scopes de OAuth y las operaciones irreversibles.
Sé concreto y breve: prefiero 80 líneas que se cumplan a 300 que se ignoren.

## Restricciones

- Nada de borrado permanente de correo: los scopes concedidos son `gmail.modify`, `gmail.send` y
  `gmail.settings.basic`, deliberadamente sin `https://mail.google.com/`.
- Es un proyecto personal de aprendizaje. Prioriza que se entienda sobre que sea exhaustivo.
- Hay dos lecciones ya aprendidas a base de romperlo que quiero que el CLAUDE.md recoja de alguna
  forma: la cuota de la API de Gmail se agota con ráfagas y reintentar no basta (hay que espaciar en
  origen), y un cambio no está verificado hasta que se ha llamado al servidor de verdad por el
  protocolo, no solo compilado.

## Qué espero de vuelta

1. Un árbol de carpetas propuesto para migrar este proyecto, fichero a fichero.
2. Una tabla de convenciones de nombres.
3. La respuesta a la pregunta de las dos fases y las anotaciones.
4. Un ejemplo de test que pueda copiar.
5. Los ficheros de configuración de linter y formateador, completos.
6. El `CLAUDE.md`, completo.
