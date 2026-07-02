# stickers/

Dos familias que se combinan al hornear el PNG final (ver `src/lib/stickers.ts`):

1. **Procedurales** (dibujados por código, sin bitmap): bola 8, sello "13"
   (Creepster), corazón pixel.
2. **Sticker sheet** (arte del cliente, PNG en esta carpeta): `ave-13.png`,
   `le-falta-aji.png`, `not-old.png`, `susy.png`, `juventud-experiencia.png`,
   `love-reset.png`.

Se hornean **hasta 4 por marco**, repartidos en las esquinas de la ventana (sobre
la foto), rotados, y **nunca sobre el nombre**. La selección/posición/rotación se
decide **una sola vez** por foto y es lo que se muestra en la confirmación y lo
que se imprime.

## Para agregar/actualizar stickers
- PNG con **fondo transparente**, recortado al motivo (sin margen).
- Lado mayor **~760px** (se hornean a ~300–360px; 760 da ~2× para 300dpi).
- Nombre kebab-case sin espacios ni tildes.
- Agrega el archivo aquí y súmalo a `PNG_STICKERS` en `src/lib/stickers.ts`.
- Los originales grandes se recortan/reescalan/optimizan antes de commitear
  (transparencia intacta) para que carguen rápido en el wifi del evento.
