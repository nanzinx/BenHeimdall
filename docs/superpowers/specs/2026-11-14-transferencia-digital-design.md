# Transferência para a Digital sem depender do supervisor

## Por quê

O operador da discadora está com o cliente na linha e precisa transferir para alguém da **equipe
Digital** (é ela que converte). Hoje só o supervisor enxerga quem da Digital está livre, então o
operador tem que perguntar a ele: o supervisor vira gargalo e o cliente espera.

Sucesso: o operador descobre sozinho, em segundos, para quem transferir; duas transferências não
caem na mesma pessoa; a distribuição entre o pessoal da Digital fica justa.

## Objetivos

- **A — "Livres da Digital agora":** uma página simples, que o operador deixa aberta, com quem da
  Digital está livre (nome, ramal, há quanto tempo), do mais ocioso para o menos.
- **B — "Preciso transferir":** um botão na mesma página. O sistema escolhe o próximo livre da
  Digital (o mais ocioso que não esteja reservado), **reserva por 60 s** e diz ao operador
  "Transfira para Fulano · ramal X".
- O BenHub (ou outro sistema) consegue consultar quem está livre.
- Tudo registrado: quem pediu, para quem foi, se a transferência chegou.

## Fora do escopo (agora)

- Transferir sozinho pela Argus: a API não transfere para um ramal (só abre o pop-up na tela do
  operador). Quem transfere continua sendo o operador, no softphone.
- Avisar o operador da Digital na tela dele (ele não tem o BenHeimdall aberto). Fica para depois.
- Relatórios de transferências por pessoa. O registro fica gravado; a tela de relatório vem depois.
- Mexer no status da Argus (pausar, liberar).

## Anti-objetivos

- Não pode virar mais uma coisa que o operador precisa "cuidar": a página tem que funcionar
  aberta numa aba o dia todo, sem login que expira a cada 15 min.
- Não pode expor dado de cliente: a página só mostra nome e ramal dos operadores da Digital.
- Não pode mandar duas transferências para a mesma pessoa ao mesmo tempo.

## Restrições

- Mesmo servidor e mesmo ciclo de leitura de hoje (Argus a cada 3 s). Nada novo na Argus.
- Fora da rede da empresa ninguém entra: a página respeita `IPS_PERMITIDOS`, como o resto.
- "Livre" é o status LIVRE da Argus; WhatsApp/Digital (`LIGAÇÃO - WPP`, `Em Atendimento - DIGITAL`)
  já contam como atendimento, então não aparecem como livres.

## Caminhos considerados

1. **A — só a página de livres:** rápida, tira o supervisor do meio, mas deixa colisão e
   distribuição injusta.
2. **B — o sistema escolhe e reserva:** resolve colisão e justiça; precisa saber quem é o operador.
3. **C — o operador pede e o supervisor responde:** mantém o gargalo. Descartado.

**Escolhido: A e depois B**, na mesma página (a A é a base da B).

## Como fica

### Página do operador (`/transferir`)

Fora da área logada do painel, numa rota própria, pensada para ficar aberta numa aba (e caber no
celular).

```
┌──────────────────────────────────────────────┐
│ BenHeimdall · Transferência        Você: [Ana Paula ▾] │
│                                                │
│  [  Preciso transferir  ]   ← botão grande     │
│                                                │
│  Livres da Digital agora (4)                   │
│  1  Igor Valente     ramal 2148   livre há 4:06│
│  2  Gustavo Pimenta  ramal 2146   livre há 0:20│
│  3  Enzo Martins     ramal 2144   reservado p/ Bruno · 0:42 │
└──────────────────────────────────────────────┘
```

Depois do clique:

```
  Transfira para  IGOR VALENTE · ramal 2148
  reservado para você por 0:58
  [ Transferi ]   [ Não consegui, outro ]
```

- **Quem é você:** na primeira vez o operador escolhe o próprio nome numa lista (operadores do
  painel que não são da Digital). Fica lembrado no navegador. _(ver Pergunta em aberto)_
- **Pedir:** o servidor escolhe o livre da Digital há mais tempo, que não esteja reservado, e
  reserva por 60 s. Um operador só tem uma reserva por vez (pedir de novo devolve a mesma).
- **Ninguém livre:** "Ninguém da Digital livre agora" e o botão vira "Avisar quando alguém ficar
  livre" (a página tenta de novo sozinha e mostra o primeiro que liberar).
- **Fim da reserva:**
  - _chegou:_ o reservado sai de LIVRE para ATENDENDO dentro dos 60 s → "concluída";
  - _"Transferi":_ concluída na hora;
  - _"Não consegui, outro":_ cancela e já pede o próximo (sem repetir o mesmo);
  - _60 s sem nada:_ expira e a pessoa volta para a fila.
- Atualiza a cada 3 s (consulta simples ao servidor, sem Socket.IO, porque não há sessão).

### Painel do supervisor

Na coluna "Livres p/ transferência", quem está reservado ganha a etiqueta
"reservado p/ Bruno · 0:42". A ordem não muda.

### Servidor

- `GET /api/publico/digital` → livres da Digital (nome, ramal, livre desde, reserva se houver) e a
  lista de operadores para o "Quem é você". Sem dado de cliente.
- `POST /api/publico/transferencias` `{ operadorId }` → cria a reserva (ou devolve a que já existe).
- `POST /api/publico/transferencias/:id/transferi` e `/:id/outro` → fecham a reserva.
- Reservas em memória (o servidor é um processo só) + tabela `transferencias` no SQLite com
  o histórico: pedida_em, operador, destino, como terminou (concluída, cancelada, expirada) e
  quando. Migração 3.
- As rotas `/api/publico/*` não exigem login, mas passam pelo filtro de `IPS_PERMITIDOS` e têm
  limite de pedidos (ex.: 1 pedido por operador a cada 3 s).
- O ciclo de leitura fecha as reservas: a cada leitura, confere quem saiu de LIVRE e quem expirou.

### BenHub e outros sistemas

`GET /api/publico/digital` já serve. Se o BenHub buscar pelo navegador (outro endereço), libera-se
o endereço dele numa variável (`ORIGENS_EXTERNAS`) para o CORS. Como o BenHub mostra isso é do lado
dele.

## Decisões que tomei (pode mudar)

- Reserva de **60 s**; ordem por **mais ocioso** (a conversão ainda não é real).
- Página **sem login**, só por IP da empresa (login de 15 min não serve para aba aberta o dia todo).
- Sem aviso para o operador da Digital nesta primeira versão.
- "Transferi" e "chegou" contam igual como concluída.

## Pergunta em aberto

**Como o sistema sabe quem é o operador?** Minha proposta é ele escolher o próprio nome uma vez
(fica salvo no navegador), sem senha. É simples, mas qualquer um pode escolher o nome de outro.
A alternativa é cada operador ter login (conta por e-mail, como os supervisores): mais seguro,
mas são ~50 contas para criar e cuidar.

## Para quem for construir

- Reaproveitar `listarLivres` / `recebeTransferencia` (`packages/shared/src/regras.ts`).
- A rota nova fica antes de `rotasUsuarios` em `app.ts` (aquele roteador exige admin em tudo).
- Testes: escolha do próximo (mais ocioso, sem reservado), uma reserva por operador, expiração,
  conclusão pelo status, colisão (dois pedidos ao mesmo tempo vão para pessoas diferentes),
  `/api/publico/*` sem login mas bloqueado fora de `IPS_PERMITIDOS`, nenhum dado de cliente na
  resposta.
