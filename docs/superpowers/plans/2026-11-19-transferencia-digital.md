# Transferência para a Digital — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** operador da discadora clica "Preciso transferir" e o sistema reserva por 60 s o livre da
Digital há mais tempo (que esteja LIVRE na Argus e tenha marcado "Estou livre"), avisando o
operador da Digital no site.

**Architecture:** perfil novo `operador` (conta com ramal, sessão do dia). Um
`ServicoTransferencia` em memória (fila, marcas "Estou livre", reservas) com histórico na tabela
`transferencias`; o ciclo de leitura o alimenta a cada leitura e decora o Painel. Página
`/transferir` no front com duas vistas (quem transfere / Digital), atualizando a cada 3 s.

**Tech Stack:** Express 5, better-sqlite3, Zod 3, Vitest, React 18 + TanStack Query, Tailwind 3.

**Spec:** `docs/superpowers/specs/2026-11-14-transferencia-digital-design.md`

## Global Constraints

- Reserva de **60 s**; escolha por **mais ocioso** (`listarLivres(agentes, 'ocioso')`).
- Entra na fila só quem está **LIVRE na Argus E marcou "Estou livre"**, é da equipe Digital
  (`recebeTransferencia`) e não está reservado. O botão **não mexe na Argus**.
- A marca dura até "Ocupado", sair, fim da sessão ou OFFLINE na Argus; pausa e ligação não apagam.
- Operador: sessão até a meia-noite (horário do servidor), **sem** expirar por 15 min de inatividade.
- Operador não vê painel, clientes, detalhe do agente, usuários nem recebe `painel:atualizado`.
- Nenhum dado de cliente nas respostas de `/api/transferencia`.
- Textos de tela em pt-BR; comentários em pt-BR, no estilo do código vizinho.
- Rotas novas antes de `rotasUsuarios` em `apps/server/src/app.ts` (ele exige admin em tudo).

## Review Focus

1. Destino sai de LIVRE para PAUSA/OFFLINE durante a reserva → a reserva termina como
   `cancelada` com motivo "destino indisponível" e o operador vê "Fulano ficou indisponível" com
   o botão para pedir outro (teste na Task 4).
2. Servidor reinicia com reserva aberta → ao subir, linhas sem `fim` viram `expirada`; o operador
   pede de novo (teste na Task 2).
3. Conta de operador cujo ramal não está na Argus → página mostra "Seu ramal (X) não aparece na
   Argus agora" e `POST /api/transferencia` responde 409 `RAMAL_FORA` (teste na Task 5).
4. Virada do dia → sessão do operador expira e as marcas "Estou livre" são limpas (testes nas
   Tasks 3 e 4).
5. Dois pedidos seguidos de operadores diferentes com um só livre → o segundo recebe "ninguém
   livre", não o mesmo destino (teste na Task 4).

---

### Task 1: Tipos e schemas compartilhados

**Files:**

- Modify: `packages/shared/src/tipos.ts`, `packages/shared/src/schemas.ts`
- Test: `packages/shared/test/regras.test.ts` (schemas)

**Interfaces:**

- Produces:
  - `Perfil = 'admin' | 'supervisor' | 'tv' | 'operador'`; `PERFIS` inclui `'operador'`.
  - `UsuarioPublico.ramal: string | null`.
  - `novoUsuarioSchema`: `perfil` aceita `'operador'`; `ramal: z.string().trim().regex(/^\d{3,12}$/).nullable().optional()`;
    refine: operador precisa de ramal (`path: ['ramal']`, mensagem "Operador precisa do ramal da Argus.").
  - `type FimReserva = 'concluida' | 'cancelada' | 'expirada'`
  - `interface Reserva { id: number; operadorNome: string; operadorRamal: string; destinoId: string; destinoNome: string; destinoRamal: string; pedidaEm: string; expiraEm: string; fim?: FimReserva; motivoFim?: string }`
  - `type EstadoTransferencia =`
    `{ papel: 'operador'; reserva: Reserva | null; livresDigital: number; aviso?: string }`
    `| { papel: 'digital'; marcado: boolean; statusArgus: StatusAgente | null; motivo?: string; recebida: Reserva | null; aviso?: string }`
  - `Agente.transferencia?: { marcouLivre: boolean; reservadoPara?: string; reservaExpiraEm?: string }`
    (só agentes da Digital) e o campo correspondente, opcional e `.strict()`, em `agenteSchema`.

- [ ] **Step 1: Teste** `novoUsuarioSchema` — `{perfil:'operador', ramal:'2101', ...}` passa; sem
      ramal falha com path `ramal`; `agenteSchema` aceita `transferencia: { marcouLivre: true }`.
- [ ] **Step 2:** `npx vitest run packages/shared` → FAIL.
- [ ] **Step 3:** implementar os tipos/schemas acima.
- [ ] **Step 4:** `npx vitest run packages/shared` → PASS; `npm run lint` sem erro (outros pacotes
      podem acusar `Perfil` não tratado: corrigir onde houver `Record<Perfil, ...>`, ex.
      `ROTULO_PERFIL.operador = 'Operador'`).
- [ ] **Step 5:** commit `Tipos da transferência e perfil operador`.

### Task 2: Banco — migração 3 e repositório

**Files:**

- Modify: `apps/server/src/db/banco.ts`, `apps/server/src/acesso/repositorio.ts`
- Create: `apps/server/src/transferencia/repositorio.ts`
- Test: `apps/server/test/transferencia.test.ts` (novo), `apps/server/test/acesso.test.ts`

**Interfaces:**

- Produces:
  - Migração 3 (nova entrada em `MIGRACOES`): recria `usuarios` com
    `CHECK (perfil IN ('admin','supervisor','tv','operador'))` e coluna `ramal TEXT` (copiando os
    dados; `PRAGMA foreign_keys` desligado durante a cópia, religado depois); cria
    `transferencias (id INTEGER PK, pedida_em TEXT, operador_id INTEGER, operador_nome TEXT, operador_ramal TEXT, destino_id TEXT, destino_nome TEXT, destino_ramal TEXT, expira_em TEXT, fim TEXT, motivo_fim TEXT, fim_em TEXT)` + índice em `pedida_em`.
  - `LinhaUsuario.ramal: string | null`; `usuarioPublico` devolve `ramal`;
    `Repositorio.criarUsuario({..., ramal?: string | null})`; `Repositorio.usuarioPorRamal(ramal): LinhaUsuario | undefined`.
  - `class RepoTransferencias { constructor(db: Banco); abrir(r: Omit<Reserva,'id'|'fim'|'motivoFim'> & { operadorId: number }): number; fechar(id: number, fim: FimReserva, em: string, motivo?: string): void; fecharAbertas(em: string): number }`

- [ ] **Step 1: Testes** — banco v2 com um supervisor migra para v3 mantendo a conta
      (`ramal` null) e aceita criar `perfil: 'operador'`; `RepoTransferencias.fecharAbertas` marca
      as linhas sem `fim` como `expirada` e devolve quantas.
- [ ] **Step 2:** `npx vitest run apps/server/test/transferencia.test.ts` → FAIL.
- [ ] **Step 3:** implementar migração, repositórios; `criarUsuario` do `ServicoAcesso` passa
      `ramal` quando `perfil === 'operador'` e o log de "Conta criada" inclui `, ramal X`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** commit `Banco: perfil operador com ramal e histórico de transferências`.

### Task 3: Acesso do operador (sessão do dia e barreiras)

**Files:**

- Modify: `apps/server/src/acesso/servico.ts`, `apps/server/src/acesso/repositorio.ts`
  (`sessoesOciosas` exclui `operador`), `apps/server/src/rotas/painel.ts`, `apps/server/src/socket.ts`
- Test: `apps/server/test/acesso.test.ts`, `apps/server/test/api.test.ts`

**Interfaces:**

- Consumes: `inicioDoDia(agora)` de `apps/server/src/leitura/eventos.ts`.
- Produces: sessão de `operador` válida enquanto `criada_em >= inicioDoDia(agora)`; `expiraEm` =
  `inicioDoDia(agora) + 24 h`; `/api/painel` e `/api/agentes/:id` com
  `perfis: ['admin','supervisor','tv']`; Socket.IO recusa handshake de `operador` (`PERFIL`).

- [ ] **Step 1: Testes** — operador ocioso 3 h continua válido; às 00:00:01 do dia seguinte
      `SESSAO_EXPIRADA`; `varrerExpiradas` não encerra sessão de operador ociosa; operador recebe 403
      em `GET /api/painel`, `GET /api/agentes/x`, `GET /api/usuarios`; handshake do Socket.IO de
      operador é recusado.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar em `validar`/`descrever` (ramo próprio para `operador`, como o de
      `tv`), `sessoesOciosas`, guardas de perfil.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** commit `Operador: sessão do dia, sem painel nem tempo real`.

### Task 4: ServicoTransferencia (fila, marcas, reservas)

**Files:**

- Create: `apps/server/src/transferencia/servico.ts`
- Test: `apps/server/test/transferencia.test.ts`

**Interfaces:**

- Consumes: `RepoTransferencias` (Task 2); `listarLivres`, `recebeTransferencia` (shared).
- Produces:

  ```ts
  interface QuemPede {
    id: number;
    nome: string;
    ramal: string;
  }
  class ServicoTransferencia {
    constructor(o: {
      repo: RepoTransferencias;
      painel: () => Painel;
      log: Log;
      agora?: () => number;
      reservaMs?: number; /* 60_000 */
    });
    marcar(ramal: string, livre: boolean): void;
    pedir(quem: QuemPede): Reserva | null; // devolve a aberta se já existir; null = ninguém livre
    transferi(quem: QuemPede, id: number): Reserva; // 404 ErroTransferencia se não for dele
    outro(quem: QuemPede, id: number): Reserva | null; // cancela (motivo "pediu outro") e pede de novo, sem o mesmo destino
    aoLer(painel: Painel): void; // conclui, expira, cancela, limpa marcas
    decorar(painel: Painel): Painel; // preenche Agente.transferencia dos agentes da Digital
    estado(quem: QuemPede): EstadoTransferencia;
  }
  class ErroTransferencia extends Error {
    constructor(status: number, codigo: string, message: string);
  }
  ```

  Regras de `aoLer`: destino `ATENDENDO` → `concluida`; destino em `PAUSA`/`OFFLINE`/`POS_ATENDIMENTO`
  ou fora do painel → `cancelada` (`motivoFim: 'destino indisponível'`); passou de `expiraEm` →
  `expirada`; agente OFFLINE ou virada do dia → apaga a marca. `estado` acha o agente pelo ramal:
  da Digital → `papel: 'digital'` (`recebida` = reserva aberta para ele ou fechada há < 30 s);
  senão `papel: 'operador'` (`livresDigital` = elegíveis sem reserva); ramal fora do painel →
  `aviso: 'Seu ramal (X) não aparece na Argus agora.'`.

- [ ] **Step 1: Testes** (painel montado à mão, relógio injetado):
  - escolhe o mais ocioso marcado; ignora quem não marcou e quem não é da Digital;
  - dois `pedir` de operadores diferentes com um só elegível → o segundo recebe `null`;
  - `pedir` duas vezes pelo mesmo operador → mesma reserva;
  - `aoLer` com destino ATENDENDO → `concluida`; com PAUSA → `cancelada` "destino indisponível";
    após 60 s → `expirada` e o destino volta a ser escolhido;
  - `outro` não repete o destino cancelado;
  - marca sobrevive a PAUSA e some com OFFLINE e na virada do dia;
  - `estado` não tem nenhuma chave de cliente (`clienteMascarado`, `telefoneMascarado`).
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** commit `Fila e reservas de transferência para a Digital`.

### Task 5: Ciclo, rotas e ligação no servidor

**Files:**

- Create: `apps/server/src/rotas/transferencia-digital.ts`
- Modify: `apps/server/src/leitura/ciclo.ts` (opção `transferencia?: ServicoTransferencia`: chama
  `aoLer` e `decorar` a cada leitura), `apps/server/src/app.ts`, `apps/server/src/index.ts`
  (`fecharAbertas` ao subir), `apps/server/test/ajuda.ts`
- Test: `apps/server/test/api.test.ts`

**Interfaces:**

- Consumes: `ServicoTransferencia` (Task 4).
- Produces (todas com `exigirSessao(..., { renovar: false, perfis: ['operador'] })`; o
  `QuemPede` vem da sessão: `id`, `nome`, `ramal` da conta):
  - `GET /api/transferencia` → `EstadoTransferencia`
  - `POST /api/transferencia` → `{ reserva: Reserva | null }`; 409 `RAMAL_FORA`; 429 `AGUARDE`
    se o mesmo operador pediu há < 3 s
  - `POST /api/transferencia/:id/transferi` → `{ reserva }`; `POST /api/transferencia/:id/outro` → `{ reserva }`
  - `POST /api/transferencia/disponivel` `{ livre: boolean }` → `EstadoTransferencia` (só papel digital; senão 403)
  - `sair` da sessão de um operador chama `marcar(ramal, false)`.

- [ ] **Step 1: Testes** (mock da Argus via `criarAmbiente`): operador da Digital marca livre,
      outro operador pede e recebe esse destino; Digital vê `recebida`; supervisor vê
      `transferencia.reservadoPara` no `/api/painel`; operador com ramal inexistente → 409
      `RAMAL_FORA`; segundo pedido em < 3 s → 429; supervisor recebe 403 em `/api/transferencia`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** commit `Rotas de transferência e ligação com o ciclo de leitura`.

### Task 6: Importar operadores da Argus

**Files:**

- Modify: `packages/argus-client/src/tipos.ts`, `.../real/RealArgusClient.ts`,
  `.../mock/MockArgusClient.ts`, `apps/server/src/acesso/servico.ts`, `apps/server/src/rotas/usuarios.ts`
- Test: `packages/argus-client/test/real.test.ts`, `apps/server/test/api.test.ts`

**Interfaces:**

- Produces:
  - `ArgusClient.listarOperadores(): Promise<{ nome: string; ramal: string; email: string | null }[]>`
    (real: o diretório de `/listarusuarios`, já sem supervisores e ramais ocultos, com `email`
    em minúsculas ou `null`; mock: os 48, com `nome.sobrenome@simulacao.benconsig.com`).
  - `ServicoAcesso.importarOperadores(admin, operadores): Promise<{ criados: { usuario: string; nome: string; ramal: string; senhaTemporaria: string }[]; jaExistiam: number; semEmail: { nome: string; ramal: string }[] }>`
    — pula e-mail ou ramal que já têm conta; um registro "Contas importadas da Argus (N)" no log.
  - `POST /api/usuarios/importar-operadores` (admin) → o objeto acima.
- [ ] **Step 1: Testes** — real: `listarOperadores` devolve e-mail do `/listarusuarios` e `null`
      sem e-mail; API: importar duas vezes cria na primeira e devolve `jaExistiam` na segunda; quem
      não tem e-mail vem em `semEmail`.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** commit `Importar operadores da Argus como contas`.

### Task 7: Front — página `/transferir`

**Files:**

- Create: `apps/web/src/paginas/PaginaTransferir.tsx`, `apps/web/src/hooks/useAvisoTransferencia.ts`
- Modify: `apps/web/src/App.tsx` (rota `/transferir` protegida para `operador`; operador que abre
  qualquer outra rota vai para `/transferir`; `Login` manda o operador para `/transferir`),
  `apps/web/src/index.css`

**Interfaces:**

- Consumes: `GET/POST /api/transferencia*` (Task 5), `EstadoTransferencia`, `Reserva` (Task 1).
- Produces: vista **operador** — botão "Preciso transferir", "Digital: N livres agora", depois
  "Transfira para NOME · ramal X / reservado para você por 0:58 / [Transferi] [Não consegui,
  outro]"; sem ninguém livre: "Ninguém da Digital livre agora. Assim que alguém liberar, aparece
  aqui." (repete o pedido a cada 3 s até vir uma reserva); reserva cancelada: "NOME ficou
  indisponível." + botão para pedir outro. Vista **digital** — "Você está: LIVRE p/ transferência"
  ou "Ocupado", botões [Estou livre] [Ocupado], aviso "Você marcou livre, mas a Argus mostra Em
  pausa · MOTIVO"; ao surgir `recebida` nova: som curto (Web Audio, sem arquivo), notificação do
  navegador "NOME vai te transferir um cliente (ramal X)" (permissão pedida no primeiro clique em
  "Estou livre") e o mesmo texto em destaque na página. Topo simples com nome e "Sair".
  `useQuery` com `refetchInterval: 3000`.
- [ ] **Step 1:** implementar a página e as rotas.
- [ ] **Step 2:** `npm run lint` e `npm run build` sem erro.
- [ ] **Step 3:** conferir no navegador (Playwright, mock): operador da Digital marca livre, outro
      operador pede, a vista digital mostra o aviso; screenshot das duas vistas.
- [ ] **Step 4:** commit `Página do operador: Preciso transferir e Estou livre`.

### Task 8: Front — painel e administração

**Files:**

- Modify: `apps/web/src/componentes/Colunas.tsx` (livres da Digital: etiqueta "reservado p/ NOME ·
  0:42" e, sem marca, linha apagada com "não marcou livre"), `apps/web/src/paginas/PaginaUsuarios.tsx`
  (perfil "Operador" com campo Ramal; botão "Importar operadores da Argus" com confirmação e tabela
  de resultado e-mail · nome · ramal · senha temporária, botão "Imprimir"; lista de quem ficou sem
  e-mail), `apps/web/src/index.css`, `README.md` (seção da transferência e do perfil operador),
  `.env.example` se surgir variável.
- [ ] **Step 1:** implementar.
- [ ] **Step 2:** `npm run lint`, `npm test`, `npm run build` sem erro.
- [ ] **Step 3:** conferir no navegador: etiquetas na coluna de livres; criar operador; importar e
      ver a tabela.
- [ ] **Step 4:** commit `Painel mostra reservas e administração cria operadores`.
