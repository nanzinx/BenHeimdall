// Schemas Zod das entradas da API (validadas no backend; o front reaproveita as mensagens).
import { z } from 'zod';

/**
 * Login padronizado: toda conta (admin, supervisor e TV) entra com um e-mail, sem diferença
 * entre maiúsculas e minúsculas. O campo continua se chamando `usuario` na API e no banco.
 */
export const emailLoginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Informe o e-mail.')
  .max(254, 'E-mail longo demais.')
  .email('Informe um e-mail válido, como nome.sobrenome@benconsig.com.');

/** "renan.leite@benconsig.com" → "Renan Leite" (nome sugerido a partir do e-mail). */
export function nomeDoEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const partes = local.split(/[._-]+/).filter(Boolean);
  if (!partes.length) return email;
  return partes.map((p) => p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)).join(' ');
}

export const loginSchema = z.object({
  // No login só normaliza (sem exigir formato de e-mail): a mensagem de erro é sempre a mesma.
  usuario: z.string().trim().toLowerCase().min(1, 'Informe o e-mail.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

export const SENHA_MIN = 8;

export const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual.'),
  novaSenha: z
    .string()
    .min(SENHA_MIN, `A nova senha precisa de pelo menos ${SENHA_MIN} caracteres.`)
    .max(128),
});

export const novoUsuarioSchema = z
  .object({
    nome: z.string().trim().min(1, 'Informe o nome da pessoa ou da tela.').max(60),
    // A Tela TV também entra por e-mail (ex.: tv.salao@benconsig.com), mesmo sem caixa de entrada.
    usuario: emailLoginSchema,
    perfil: z.enum(['admin', 'supervisor', 'tv']),
    equipe: z.number().int().min(1).max(99).nullable().optional(),
  })
  .refine((u) => u.perfil !== 'supervisor' || (u.equipe ?? null) !== null, {
    message: 'Supervisor precisa de uma equipe.',
    path: ['equipe'],
  });

export type LoginEntrada = z.infer<typeof loginSchema>;
export type TrocarSenhaEntrada = z.infer<typeof trocarSenhaSchema>;
export type NovoUsuarioEntrada = z.infer<typeof novoUsuarioSchema>;

// Schema do Painel. Usado nos testes para garantir que o backend só entrega dados válidos.
const iso = z.string().datetime({ offset: true });

export const agenteSchema = z
  .object({
    id: z.string().min(1),
    nome: z.string().min(1),
    ramal: z.string(),
    equipe: z.number().int().min(0).max(99),
    lado: z.enum(['E', 'D']).optional(),
    posicao: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    supervisor: z.string(),
    status: z.enum(['ATENDENDO', 'POS_ATENDIMENTO', 'PAUSA', 'LIVRE', 'OFFLINE']),
    desde: iso,
    pausa: z
      .object({
        motivo: z.string().optional(),
        limiteSeg: z.number().nonnegative(),
        totalDiaSeg: z.number().nonnegative(),
      })
      .strict()
      .optional(),
    atendimento: z
      .object({
        codigoCliente: z.string().optional(),
        clienteMascarado: z.string().optional(),
        telefoneMascarado: z.string().optional(),
        campanha: z.string(),
        inicio: iso,
      })
      .strict()
      .optional(),
    dia: z
      .object({ atendimentos: z.number().int().nonnegative(), vendas: z.number().int().nonnegative() })
      .strict(),
  })
  .strict();

export const painelSchema = z
  .object({
    atualizadoEm: iso,
    argusOnline: z.boolean(),
    ultimaLeituraArgus: iso,
    agentes: z.array(agenteSchema),
    filaEspera: z.number().int().nonnegative(),
    callbacks: z.number().int().nonnegative(),
  })
  .strict();
