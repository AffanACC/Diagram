import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds the generic viewer ONCE into template/index.html (one self-contained file:
// JS + CSS inlined, no CDN, no external requests). Diagrams are injected later by
// scripts/make.mjs, so changing a diagram never needs a rebuild.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'template', emptyOutDir: true },
})
