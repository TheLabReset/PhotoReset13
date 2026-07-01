import GuestApp from './screens/GuestApp'
import PanelApp from './screens/PanelApp'

// Router mínimo: el panel de operador vive en una ruta aparte (/panel).
// Netlify redirige /* -> /index.html para que esta ruta funcione (SPA).
export default function App() {
  const isPanel = window.location.pathname.replace(/\/$/, '') === '/panel'
  return (
    <div className="stage">
      <div className="phone">{isPanel ? <PanelApp /> : <GuestApp />}</div>
    </div>
  )
}
