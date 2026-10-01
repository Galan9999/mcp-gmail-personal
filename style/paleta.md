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
| **Trabajo** | `#0d3472` azul profundo | `#b6cff5` | Compromiso con terceros. No depende solo de ti. |
| **Personal** | `#04502e` verde | `#a2dcc1` | Tuyo y sin plazo. Importa, pero no corre. |
| **Viaje** | `#7a4706` ámbar | `#ffdeb5` | Tiene fecha. Lo cálido avisa de que caduca. |
| **Recibos** | `#464646` gris | `#e7e7e7` | Archivo. Guardar y olvidar hasta que haga falta. |
| **Notes** | `#3d188e` morado | `#e3d7ff` | Ideas. No pide acción, pide volver a leerlo. |
| **Sideprojects** | `#0d3b44` turquesa | `#98d7e4` | Compromiso técnico, pero contigo mismo. Frío, aparte del azul. |
| **Ruido** | `#e7e7e7` gris claro | `#666666` | Marketing. Se retira a la vista a propósito. |
| **Ruido/Aerolíneas** | `#fdedc1` ámbar apagado | `#684e07` | Promo con fecha, pero no te compromete. Cálido atenuado. |

`Ruido/Aerolíneas` cuelga de `Ruido`: la barra anida en Gmail, así que hereda el sitio y el
significado sin ensuciar `Viaje`, que se reserva para viajes de verdad.

## Por qué estos hex y no otros

Gmail **no acepta cualquier color**: solo 113 valores concretos, extraídos en
`src/generated/palette.ts` desde los tipos de la propia API. `set_label_color` valida contra esa
lista y rechaza lo que no esté, con el mensaje que te dice dónde mirar.

Los cinco pares elegidos son pares **nativos** de Gmail: cada fondo oscuro tiene su texto claro
correspondiente dentro de la paleta. Por eso contrastan bien sin haber tenido que calcular nada.

## Cambiarla

Edita `style/paleta.json` y vuelve a aplicar. La herramienta `list_label_colors` devuelve a la vez
los 113 permitidos y esta leyenda, así que una sesión puede proponerte alternativas sin inventarse
colores que Gmail rechazaría.

## Lo que no se puede

El **tema de Gmail** (fondo, colores de la interfaz) no es automatizable: la palabra `theme` aparece
**0 veces** en los 385 KB de tipos de la API. Es una función de la web de Gmail, no del producto que
Google expone. Para eso: ⚙ → Temas → Mis fotos, a mano.
