import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    root: path.resolve(__dirname),
    server: {
        port: 3333,
        open: true
    },
    build: {
        outDir: '../../../dist/horses-admin',
        emptyOutDir: true
    },
    define: {
        'process.env': {}
    }
});
