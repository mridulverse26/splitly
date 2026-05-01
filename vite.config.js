import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Served at https://<user>.github.io/splitly/ — set the base path so
  // assets resolve correctly. Override with VITE_BASE=/ for local dev / Render.
  base: process.env.VITE_BASE ?? '/splitly/',
  plugins: [react()],
})
