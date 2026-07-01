import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend is deployed on Netlify (base = frontend). The backend URL is
// injected at build time via VITE_API_BASE_URL (see .env.example).
export default defineConfig({
  plugins: [react()],
})
