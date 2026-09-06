// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'
// import { visualizer } from 'rollup-plugin-visualizer'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [
//     react(),
//     visualizer({ filename: 'stats.html', template: 'treemap', open: false })
//   ],
//   assetsInclude: ['**/*.lottie'],
//   build: {
//     rollupOptions: {
//       output: {
//         manualChunks(id) {
//           if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
//             return 'vendor';
//           }
//           if (id.includes('node_modules/framer-motion') || id.includes('node_modules/react-icons')) {
//             return 'ui';
//           }
//           if (id.includes('node_modules/@tiptap') || id.includes('node_modules/tiptap') || id.includes('node_modules/prosemirror')) {
//             return 'editor';
//           }
//           if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
//             return 'charts';
//           }
//           if (id.includes('node_modules/lottie-react') || id.includes('node_modules/@lottiefiles')) {
//             return 'lottie';
//           }
//         }
//       }
//     }
//   },
//   server: {
//     allowedHosts: [
//       'turret-suing-snub.ngrok-free.dev', // Add your ngrok domain here
//     ],
//     proxy: {
//       '/api': {
//         target: 'https://sureproed.com',
//         changeOrigin: true,
//         secure: false,
//       },
//       '/ws': {
//         target: 'wss://sureproed.com',
//         ws: true,
//         secure: false,
//         changeOrigin: true,
//       },
//       '/media': {
//         target: 'https://sureproed.com',
//         changeOrigin: true,
//         secure: false,
//       },
//     },
//   },
//   preview: {
//     proxy: {
//       '/api': {
//         target: 'https://sureproed.com',
//         changeOrigin: true,
//         secure: false,
//       },
//       '/ws': {
//         target: 'wss://sureproed.com',
//         ws: true,
//         secure: false,
//         changeOrigin: true,
//       },
//       '/media': {
//         target: 'https://sureproed.com',
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
    modulePreload: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Heavy dynamic libraries first
            if (id.includes('@tiptap') || id.includes('prosemirror')) {
              return 'vendor-editor';
            }
            if (id.includes('recharts') || id.includes('d3')) {
              return 'vendor-charts';
            }
            if (id.includes('lottie-react') || id.includes('@lottiefiles') || id.includes('lottie-web')) {
              return 'vendor-lottie';
            }
            if (id.includes('framer-motion')) {
              return 'vendor-motion';
            }
            if (id.includes('react-icons') || id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // Base react libraries last so they don't swallow other packages that have 'react' in the path
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router/') || id.includes('/react-router-dom/')) {
              return 'vendor-react';
            }
          }
        }
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