# frame/

El marco de impresión **no** es una imagen: se dibuja en el canvas al componer
el PNG final (fondo negro/rojo + keyline + "13 AÑOS" + logo R + nombre) — ver
`src/lib/compose.ts`. El preview ES la impresión; no hay marco PNG separado ni
doble marco.

Si algún día se hornea un marco como imagen, debe ser **alta resolución o
vectorial** para no salir suave a 1200×1800 @300dpi.
