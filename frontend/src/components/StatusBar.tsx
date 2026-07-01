// Espaciador superior. En el prototipo aquí iba una barra de estado falsa
// (13:13 ••• ▮) — puro mockup; en producción no va. Dejamos solo un respiro
// que respeta el notch (safe-area) para que el contenido no quede tapado.
export default function StatusBar() {
  return (
    <div
      style={{
        flex: 'none',
        height: 'calc(env(safe-area-inset-top, 0px) + 18px)',
      }}
    />
  )
}
