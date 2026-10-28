// Mensagem clara quando o backend não consegue subir. No dev, o painel mostraria só "o servidor
// não está respondendo"; aqui fica escrito no terminal o que fazer.
import { ZodError } from 'zod';

export function explicarFalhaNaPartida(err: unknown): string {
  const e = err as NodeJS.ErrnoException & { port?: number };
  let motivo: string;
  if (err instanceof ZodError) {
    const itens = err.issues.map((i) => `  - ${i.path.join('.') || 'valor'}: ${i.message}`).join('\n');
    motivo = `Configuração inválida no .env:\n${itens}`;
  } else if (e?.code === 'EADDRINUSE') {
    motivo = `A porta ${e.port ?? ''} já está em uso. Feche o outro "npm run dev" (ou outro sistema nessa porta) ou mude PORT no .env.`;
  } else if (
    e?.code === 'ERR_DLOPEN_FAILED' ||
    /NODE_MODULE_VERSION|was compiled against a different Node/.test(e?.message ?? '')
  ) {
    motivo =
      'Um módulo nativo (better-sqlite3 ou bcrypt) foi instalado com outra versão do Node.\n' +
      '  Rode na pasta do BenHeimdall:  Remove-Item -Recurse -Force node_modules  e depois  npm install';
  } else if (e?.code === 'SQLITE_CANTOPEN' || /unable to open database/i.test(e?.message ?? '')) {
    motivo = `Não foi possível abrir o banco (DB_PATH). Confira se a pasta existe e pode ser gravada.\n  ${e.message}`;
  } else {
    motivo = e?.message ?? String(err);
  }
  return [
    '',
    '==================== BenHeimdall não conseguiu iniciar ====================',
    motivo,
    '==========================================================================',
    '',
    err instanceof Error && !(err instanceof ZodError) ? (err.stack ?? '') : '',
  ].join('\n');
}
