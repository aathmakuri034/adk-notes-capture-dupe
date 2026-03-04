import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    main: 'src/main.ts',
    'streaming-service': 'src/application/streaming/streaming-service.ts',
    'database/index': 'src/database/index.ts',
    'infrastructure/azure/azure-blob-storage': 'src/infrastructure/azure/azure-blob-storage.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
  external: ['better-sqlite3', 'pino', 'pino-pretty'],
  onSuccess: 'echo "Build complete!"',
});