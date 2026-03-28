import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/schemas/index.ts', 'src/types/index.ts', 'src/models/recording.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: ['expo-constants', 'react-native'],
  noExternal: [],
});
