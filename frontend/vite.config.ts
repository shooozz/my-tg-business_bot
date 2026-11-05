import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Two SPAs from one project: the public storefront (store.html, served at /)
// and the admin panel (admin.html, served at /admin). The build lands in
// ../app/web, which FastAPI serves; /assets holds the hashed bundles.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../app/web',
    emptyOutDir: true,
    rollupOptions: {
      input: { store: 'store.html', admin: 'admin.html' },
    },
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
