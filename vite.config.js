// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
//   assetsInclude: ['**/*.lottie'],
//   server: {
//     allowedHosts: [
//       'turret-suing-snub.ngrok-free.dev', // Add your ngrok domain here
//     ],
//     proxy: {
//       '/api': {
//         target: 'http://106.51.129.34:8000',
//         changeOrigin: true,
//         secure: false,
//       },
//       '/ws': {
//         target: 'ws://106.51.129.34:8000',
//         ws: true,
//       },
//       '/media': {
//         target: 'http://106.51.129.34:8000',
//         changeOrigin: true,
//         secure: false,
//       },
//     },
//   },
//   preview: {
//     proxy: {
//       '/api': {
//         target: 'http://106.51.129.34:8000',
//         changeOrigin: true,
//         secure: false,
//       },
//       '/ws': {
//         target: 'ws://106.51.129.34:8000',
//         ws: true,
//       },
//       '/media': {
//         target: 'http://106.51.129.34:8000',
//         changeOrigin: true,
//         secure: false,
//       },
//     },
//   },
// })



// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
//   assetsInclude: ['**/*.lottie'],
//   server: {
//     allowedHosts: [
//       'turret-suing-snub.ngrok-free.dev', // Add your ngrok domain here
//     ],
//     proxy: {
//       '/api': {
//         target: 'http://106.51.129.34:8000',
//         changeOrigin: true,
//         secure: false,
//       },
//       '/ws': {
//         target: 'ws://106.51.129.34:8000',
//         ws: true,
//       },
//       '/media': {
//         target: 'http://106.51.129.34:8000',
//         changeOrigin: true,
//         secure: false,
//       },
//     },
//   },
//   preview: {
//     proxy: {
//       '/api': {
//         target: 'http://106.51.129.34:8000',
//         changeOrigin: true,
//         secure: false,
//       },
//       '/ws': {
//         target: 'ws://106.51.129.34:8000',
//         ws: true,
//       },
//       '/media': {
//         target: 'http://106.51.129.34:8000',
//         changeOrigin: true,
//         secure: false,
//       },
//     },
//   },
// })







import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({ filename: 'stats.html', template: 'treemap', open: false })
  ],
  assetsInclude: ['**/*.lottie'],
  build: {
    minify: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Let Rolldown handle native code-splitting for React.lazy()
      }
    }
  },
  server: {
    allowedHosts: [
      'turret-suing-snub.ngrok-free.dev', // Add your ngrok domain here
    ],
    proxy: {
      '/api': {
        target: 'https://sureproed.com',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'wss://sureproed.com',
        ws: true,
        secure: false,
        changeOrigin: true,
      },
      '/media': {
        target: 'https://sureproed.com',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'https://sureproed.com',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'wss://sureproed.com',
        ws: true,
        secure: false,
        changeOrigin: true,
      },
      '/media': {
        target: 'https://sureproed.com',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})