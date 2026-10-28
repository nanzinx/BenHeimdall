// Schemas Zod das entradas da API (validadas no backend; o front reaproveita as mensagens).
import { z } from 'zod';

export const usuarioRegex = /^[a-z0-9._-]{3,30}$/;

export const loginSchema = z.object({
  usuario: z.string().trim().toLowerCase().min(1, 'Informe o usuário.'),
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
    usuario: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        usuarioRegex,
        'Usuário com 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.',
      ),
    perfil: z.enum(['admin', 'supervisor', 'tv']),
    equipe: z.number().int().min(1).max(5).nullable().optional(),
  })
  .refine((u) => u.perfil !== 'supervisor' || (u.equipe ?? null) !== null, {
    message: 'Supervisor precisa de uma equipe.',
    path: ['equipe'],
  });

export type LoginEntrada = z.infer<typeof loginSchema>;
export type TrocarSenhaEntrada = z.infer<typeof trocarSenhaSchema>;
export type NovoUsuarioEntrada = z.infer<typeof novoUsuarioSchema>;
