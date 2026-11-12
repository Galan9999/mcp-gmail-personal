# Leyenda de colores de las etiquetas

El color **no dice de qué trata** la etiqueta. Dice **qué te pide**.

Esa es toda la regla. Si la aprendes, al abrir Gmail no lees los nombres: ves el color y ya sabes
si eso reclama algo de ti o no.

## El eje

```
   FRÍO ─────────────────────────────── CÁLIDO
   compromiso con otros          corre el tiempo

   Azul          Verde        Ámbar
   Trabajo       Personal     Viaje

   ── fuera del eje ──
   Gris     solo archivar, nada que hacer
   Morado   pensar, releer, nada que hacer
```

## La tabla

| Etiqueta | Fondo | Texto | Qué significa |
|---|---|---|---|
| **Trabajo** | `#3c78d8` azul vivo | `#ffffff` | Compromiso con terceros. No depende solo de ti. |
| **Sideprojects** | `#2da2bb` turquesa | `#ffffff` | También frío, pero el tercero eres tú. |
| **Personal** | `#16a766` verde vivo | `#ffffff` | Tuyo y sin plazo. Importa, pero no corre. |
| **Viaje** | `#ff7537` naranja vivo | `#ffffff` | Tiene fecha de verdad. |
| **Aerolineas** | `#fad165` amarillo | `#000000` | Misma familia cálida que Viaje, pero es promo. |
| **Recibos** | `#e66550` coral | `#ffffff` | Dinero. Guardar, y a veces pagar. |
| **Notes** | `#a479e2` morado vivo | `#ffffff` | Ideas. Releer, no actuar. |
| **Ruido** | `#cccccc` gris | `#666666` | El único gris, y significa una sola cosa: ignorar. |

Gris hay uno solo, y por eso funciona: si algo está gris, no lo mires.

## Por qué estos hex y no otros

Gmail **no acepta cualquier color**: solo 113 valores concretos, extraídos en
`src/generated/palette.ts` desde los tipos de la propia API. `set_label_color` valida contra esa
lista y rechaza lo que no esté, con el mensaje que te dice dónde mirar.

Los ocho pares elegidos son pares **nativos** de Gmail: cada fondo oscuro tiene su texto claro
correspondiente dentro de la paleta. Por eso contrastan bien sin haber tenido que calcular nada.

## Cambiarla

`style/paleta.json` es una plantilla de ejemplo con las etiquetas del autor. Para la tuya, cópiala a
`style/paleta.local.json` (git la ignora; el servidor la prefiere si existe) y edita ahí; luego vuelve a
aplicar los colores con `set_label_color`. La herramienta `list_label_colors` devuelve a la vez
los 113 permitidos y esta leyenda, así que una sesión puede proponerte alternativas sin inventarse
colores que Gmail rechazaría.

## Lo que no se puede

El **tema de Gmail** (fondo, colores de la interfaz) no es automatizable: la palabra `theme` aparece
**0 veces** en los 385 KB de tipos de la API. Es una función de la web de Gmail, no del producto que
Google expone. Para eso: ⚙ → Temas → Mis fotos, a mano.
