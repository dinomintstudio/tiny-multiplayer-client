import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
    define: {
        'import.meta.env.ICE_SERVERS': JSON.stringify(process.env.ICE_SERVERS),
        'import.meta.env.WS_URL': JSON.stringify(process.env.WS_URL)
    },
    plugins: [solidPlugin()],
    server: {
        port: 3000,
        hmr: false,
        watch: undefined
    },
    build: {
        target: 'esnext'
    }
})
