import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.lottie'],
  server: {
    proxy: {
      '/api': {
        target: 'http://106.51.129.34:8000',
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: 'http://106.51.129.34:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'http://106.51.129.34:8000',
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: 'http://106.51.129.34:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
//   server: {
//     proxy: {
//       '/api': {
//         target: 'http://127.0.0.1:8000',
//         changeOrigin: true,
//         secure: false,
//       },
//     },
//   },
//   preview: {
//     proxy: {
//       '/api': {
//         target: 'http://127.0.0.1:8000',
//         changeOrigin: true,
//         secure: false,
//       },
//     },
//   },
// })