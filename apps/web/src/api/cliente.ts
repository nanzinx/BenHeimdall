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

/** O backend não respondeu: no dev, o Vite devolve 500 sem corpo quando o servidor está fora do ar. */
const SERVIDOR_FORA =
  'O servidor do BenHeimdall não está respondendo. Veja o motivo no terminal do "npm run dev" (linhas [server]).';

export async function api<T>(caminho: string, opcoes: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(caminho, {
      method: opcoes.method ?? 'GET',
      credentials: 'same-origin',
      headers: opcoes.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
    });
  } catch {
    throw new ErroApi(0, 'SERVIDOR_FORA', SERVIDOR_FORA);
  }
  if (res.status === 204) return undefined as T;
  const corpo = (await res.json().catch(() => ({}))) as { codigo?: string; mensagem?: string };
  if (!res.ok) {
    // Toda resposta de erro do BenHeimdall traz "mensagem"; sem ela, quem respondeu foi o proxy.
    const erro = corpo.mensagem
      ? new ErroApi(res.status, corpo.codigo ?? 'ERRO', corpo.mensagem)
      : res.status >= 500
        ? new ErroApi(res.status, 'SERVIDOR_FORA', SERVIDOR_FORA)
        : new ErroApi(res.status, 'ERRO', `Erro ${res.status}`);
    const daSessao = caminho.startsWith('/api/sessao/entrar') || caminho === '/api/sessao';
    if (!daSessao && (res.status === 401 || erro.codigo === 'TROCA_SENHA')) aoPerderSessao(erro.codigo);
    throw erro;
  }
  return corpo as T;
}
