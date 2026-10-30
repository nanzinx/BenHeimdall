// Utilitários de teste: leitura completa do mock, já validada.
import { MockArgusClient } from '@benheimdall/argus-client';
import { validarLeitura, type LimitesPausa } from '../src/leitura/normalizador';

export const LIMITES: LimitesPausa = {
  padraoSeg: 900,
  porMotivoSeg: { Almoço: 3600, Descanso: 600, Banheiro: 300, Feedback: 900 },
};

export async function lerMock(mock: MockArgusClient) {
  const [agentes, chamadas, motivos, fila, callbacks] = await Promise.all([
    mock.listarAgentes(),
    mock.listarChamadasAtivas(),
    mock.listarMotivosPausa(),
    mock.obterFila(),
    mock.obterCallbacks(),
  ]);
  return validarLeitura({ agentes, chamadas, motivos, fila, callbacks });
}

// ---------- ambiente completo (banco em memória, mock, serviço de acesso) ----------
import { Repositorio } from '../src/acesso/repositorio';
import { ServicoAcesso } from '../src/acesso/servico';
import { gerarHash } from '../src/acesso/senhas';
import { criarApp } from '../src/app';
import { carregarConfig } from '../src/config';
import { abrirBanco } from '../src/db/banco';
import { CicloLeitura } from '../src/leitura/ciclo';
import { RegistroStatus } from '../src/leitura/eventos';
import { logSilencioso } from '../src/log';

export function criarAmbiente(
  opcoes: {
    agora?: () => Date;
    tvIps?: string;
    ipsPermitidos?: string;
    trustProxy?: string;
    acessoLivre?: boolean;
  } = {},
) {
  const config = carregarConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
    TV_ALLOWED_IPS: opcoes.tvIps ?? '127.0.0.1,::1',
    POLL_MS: '3000',
    IPS_PERMITIDOS: opcoes.ipsPermitidos ?? '',
    TRUST_PROXY: opcoes.trustProxy ?? '',
  });
  const db = abrirBanco(':memory:');
  const registro = new RegistroStatus(db);
  const agora = opcoes.agora ?? (() => new Date());
  const servico = new ServicoAcesso(new Repositorio(db), {
    sessaoMin: 15,
    tvIps: config.tvIps,
    log: logSilencioso,
    agora,
    custoBcrypt: 4,
    acessoLivre: opcoes.acessoLivre,
  });
  const argus = new MockArgusClient({ semente: 9 });
  const ciclo = new CicloLeitura({ argus, registro, limites: LIMITES, pollMs: 3000, log: logSilencioso });
  return {
    config,
    db,
    registro,
    servico,
    argus,
    ciclo,
    criar: () => criarApp({ config, db, argus, ciclo, registro, servico, log: logSilencioso }),
  };
}

/** Cria uma conta e já troca a senha temporária, deixando-a pronta para uso. */
export async function contaPronta(
  servico: ServicoAcesso,
  dados: { usuario: string; perfil: 'admin' | 'supervisor' | 'tv'; equipe?: number | null },
  senha = 'senha-definitiva',
) {
  const admin = {
    id: 0,
    usuario: 'teste',
    nome: 'Teste',
    perfil: 'admin' as const,
    equipe: null,
    ativo: true,
    trocaSenha: false,
    ultimoAcesso: null,
  };
  const { usuario, senhaTemporaria } = await servico.criarUsuario(admin, {
    nome: dados.usuario,
    equipe: null,
    ...dados,
  });
  servico.repo.definirSenha(usuario.id, await gerarHash(senha, 4), false);
  return { id: usuario.id, senhaTemporaria, senha };
}
