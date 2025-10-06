import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST

// https://vitejs.dev/config/
export default defineConfig(async () => ({
    plugins: [
        react({
            babel: {
                plugins: [
                    [
                        'babel-plugin-react-compiler',
                        {
                            target: '18',
                            panicThreshold: 'all_errors',
                            logger: {
                                logEvent(filename, event) {
                                    console.log(`[Compiler] ${event.kind}: ${filename}`)
                                },
                            },
                        },
                    ],
                ],
            },
        }),
    ],

    build: { chunkSizeWarningLimit: 2048 },

    esbuild: {
        supported: {
            'top-level-await': false, //browsers can handle top-level-await features
        },
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: 'ws',
                  host,
                  port: 1421,
              }
            : undefined,
        watch: {
            // 3. tell vite to ignore watching `src-tauri`
            ignored: ['**/src-tauri/**'],
        },
    },
}))
