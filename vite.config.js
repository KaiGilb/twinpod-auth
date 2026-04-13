import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],

  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'TwinPodAuth',
      // Output as dist/index.js (ES module only)
      fileName: () => 'index.js',
      formats: ['es']
    },
    rollupOptions: {
      // Only vue is external — consumers supply it via their own Vue install.
      // @inrupt/solid-client-authn-browser is bundled so the consuming app
      // does not need to install or configure it separately.
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' }
      }
    }
  },

  test: {
    // jsdom gives composables access to window.location and other browser globals
    environment: 'jsdom'
  }
})
