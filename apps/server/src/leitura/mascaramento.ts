// Mascaramento de dados de cliente. Tudo que sai do backend passa por aqui.

/**
 * Telefone parcial: `(11) 9****-1234` para celular, `(11) ****-1234` para fixo.
 * Aceita o número com ou sem DDI 55 e com qualquer pontuação.
 */
export function mascararTelefone(bruto: string): string {
  let d = bruto.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return '(**) ****-****';
  const ddd = d.slice(0, 2);
  const final = d.slice(-4);
  return d.length === 11 ? `(${ddd}) ${d[2]}****-${final}` : `(${ddd}) ****-${final}`;
}

/** Só o primeiro nome do cliente, com a inicial maiúscula. */
export function primeiroNome(bruto: string): string {
  const nome = bruto.trim().split(/\s+/)[0] ?? '';
  if (!nome) return '—';
  return nome.charAt(0).toLocaleUpperCase('pt-BR') + nome.slice(1).toLocaleLowerCase('pt-BR');
}
