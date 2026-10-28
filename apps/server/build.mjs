// Build de produção do backend: um único dist/index.js (ESM, Node 20).
// Os pacotes do workspace (@benheimdall/*, em TypeScript) entram no bundle; as dependências do
// npm ficam de fora (externas) e são instaladas normalmente — inclusive as nativas
// (better-sqlite3, bcrypt), que não podem ser empacotadas. Por isso, toda dependência npm dos
// pacotes do workspace (axios, zod...) também precisa estar declarada no package.json do servidor:
// assim existe uma única cópia de cada uma em produção.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'externas-npm',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@benheimdall/') ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});
