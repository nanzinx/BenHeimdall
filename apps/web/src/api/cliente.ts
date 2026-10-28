// Chamadas à API do BenHeimdall. O cookie de sessão é httpOnly: o navegador o envia sozinho.

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    message: string,
  ) {
    super(message);
    this.name = 'ErroApi';
  }
}

type AoPerderSessao = (codigo: string) => void;
let aoPerderSessao: AoPerderSessao = () => {};

/** Registrado pelo provedor de sessão: qualquer 401/TROCA_SENHA fora do login dispara a revalidação. */
export function definirAoPerderSessao(fn: AoPerderSessao) {
  aoPerderSessao = fn;
}

export async function api<T>(caminho: string, opcoes: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(caminho, {
    method: opcoes.method ?? 'GET',
    credentials: 'same-origin',
    headers: opcoes.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const corpo = (await res.json().catch(() => ({}))) as { codigo?: string; mensagem?: string };
  if (!res.ok) {
    const erro = new ErroApi(res.status, corpo.codigo ?? 'ERRO', corpo.mensagem ?? `Erro ${res.status}`);
    const daSessao = caminho.startsWith('/api/sessao/entrar') || caminho === '/api/sessao';
    if (!daSessao && (res.status === 401 || erro.codigo === 'TROCA_SENHA')) aoPerderSessao(erro.codigo);
    throw erro;
  }
  return corpo as T;
}
