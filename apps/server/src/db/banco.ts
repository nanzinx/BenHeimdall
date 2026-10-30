// Conexão com o SQLite e criação das tabelas.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Banco = Database.Database;

const MIGRACOES = [
  `CREATE TABLE IF NOT EXISTS status_eventos (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     agente_id TEXT NOT NULL,
     status TEXT NOT NULL,
     motivo TEXT,
     inicio TEXT NOT NULL,          -- ISO 8601 em UTC
     fim TEXT                       -- NULL = status em curso
   );
   CREATE INDEX IF NOT EXISTS idx_eventos_agente_inicio ON status_eventos (agente_id, inicio);
   CREATE INDEX IF NOT EXISTS idx_eventos_abertos ON status_eventos (agente_id) WHERE fim IS NULL;
   CREATE INDEX IF NOT EXISTS idx_eventos_fim ON status_eventos (fim);

   CREATE TABLE IF NOT EXISTS usuarios (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     usuario TEXT NOT NULL UNIQUE,
     nome TEXT NOT NULL,
     perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'supervisor', 'tv')),
     equipe INTEGER,
     senha_hash TEXT NOT NULL,
     ativo INTEGER NOT NULL DEFAULT 1,
     troca_senha INTEGER NOT NULL DEFAULT 1,
     tentativas INTEGER NOT NULL DEFAULT 0,
     bloqueado_ate TEXT,
     criado_em TEXT NOT NULL,
     ultimo_acesso TEXT
   );

   CREATE TABLE IF NOT EXISTS sessoes (
     id TEXT PRIMARY KEY,           -- hash SHA-256 do token do cookie (o token nunca é gravado)
     usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
     criada_em TEXT NOT NULL,
     ultimo_uso TEXT NOT NULL,
     ip TEXT,
     encerrada_em TEXT,
     motivo_fim TEXT
   );
   CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id);

   CREATE TABLE IF NOT EXISTS acessos (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     em TEXT NOT NULL,
     usuario TEXT NOT NULL,
     evento TEXT NOT NULL,
     detalhe TEXT,
     ip TEXT
   );
   CREATE INDEX IF NOT EXISTS idx_acessos_em ON acessos (em);`,
  // Última leitura em que o status aberto foi visto: com o servidor parado, a pausa não cresce.
  `ALTER TABLE status_eventos ADD COLUMN visto_em TEXT;
   UPDATE status_eventos SET visto_em = inicio WHERE fim IS NULL;`,
];

export function abrirBanco(arquivo: string): Banco {
  if (arquivo !== ':memory:') mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new Database(arquivo);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const versao = db.pragma('user_version', { simple: true }) as number;
  for (let v = versao; v < MIGRACOES.length; v++) {
    db.transaction(() => {
      db.exec(MIGRACOES[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return db;
}

export function bancoOk(db: Banco): boolean {
  try {
    return db.prepare('SELECT 1 AS ok').get() !== undefined;
  } catch {
    return false;
  }
}
