import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';

export const CUSTO_BCRYPT = 12;

export function gerarHash(senha: string, custo = CUSTO_BCRYPT): Promise<string> {
  return bcrypt.hash(senha, custo);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

// Sem caracteres ambíguos (0/o, 1/l/i), para ditar a senha sem erro.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Senha temporária de 10 caracteres, gerada com fonte criptográfica. */
export function gerarSenhaTemporaria(tamanho = 10): string {
  let s = '';
  for (let i = 0; i < tamanho; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}
