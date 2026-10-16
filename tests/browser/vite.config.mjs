import { fileURLToPath } from 'node:url';

// Isolated local verification: no host session, API client or database access.
export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
};
