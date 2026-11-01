// Entrada do painel, em ~2,8 s (mesma ideia da entrada do BenURA, com a cara do BenHeimdall):
//  1. o olho de Heimdall surge no centro, abre, olha o salão de um lado para o outro e pisca,
//     com ondas saindo dele;
//  2. a logo "expande": o nome BenHeimdall sai de trás do ícone (o conjunto fica no centro);
//  3. "Bom dia, Renan" sobe palavra por palavra e os números de agora (Argus, em ligação, livres
//     e em pausa) entram um a um, contando de 0 até o valor;
//  4. uma barrinha mostra quanto falta; na saída, abre um círculo do centro e o painel entra
//     em cascata.
// Um clique ou uma tecla pula. Aparece uma vez por dia em cada navegador e sempre logo depois
// do login (entrada.ts). Usa os dados que o painel já tem. Com "reduzir movimento", só esmaece.
import clsx from 'clsx';
import { Fragment, useEffect, useRef, useState } from 'react';
import { contarPorStatus, type Painel } from '@benheimdall/shared';
import { primeiroNome, saudacao, valorNaContagem } from '../entrada';

const DURACAO_MS = 2800;
const SAIDA_MS = 600;
const CONTAGEM_MS = 650;

const movimentoReduzido = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Conta de 0 até `valor`, começando `atrasoMs` depois de montar (ou na hora, se o valor chegar depois). */
function useContagem(valor: number | null, atrasoMs: number): number | null {
  const [mostrado, setMostrado] = useState<number | null>(null);
  useEffect(() => {
    if (valor == null) return undefined;
    if (movimentoReduzido()) {
      setMostrado(valor);
      return undefined;
    }
    let quadro = 0;
    const id = setTimeout(() => {
      const inicio = performance.now();
      const passo = (t: number) => {
        setMostrado(valorNaContagem(valor, t - inicio, CONTAGEM_MS));
        if (t - inicio < CONTAGEM_MS) quadro = requestAnimationFrame(passo);
      };
      quadro = requestAnimationFrame(passo);
    }, atrasoMs);
    return () => {
      clearTimeout(id);
      cancelAnimationFrame(quadro);
    };
  }, [valor, atrasoMs]);
  return valor == null ? null : (mostrado ?? 0);
}

/** O olho de Heimdall (o mesmo da marca), em partes para poder abrir, olhar e piscar. */
function Olho() {
  return (
    <svg viewBox="0 0 64 64" className="block size-16" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#0B3D91" />
      <g className="en-olho">
        <path
          d="M10 32s8-15 22-15 22 15 22 15-8 15-22 15-22-15-22-15Z"
          fill="none"
          stroke="#fff"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <g className="en-iris">
          <circle cx="32" cy="32" r="7.5" fill="#F5C400" />
          <circle cx="32" cy="32" r="3" fill="#0B3D91" />
          <circle cx="34.6" cy="29.4" r="1.6" fill="#fff" />
        </g>
      </g>
    </svg>
  );
}

export function Entrada({
  painel,
  nome,
  aoSair,
  aoTerminar,
}: {
  painel: Painel | undefined;
  nome: string | null;
  aoSair: () => void;
  aoTerminar: () => void;
}) {
  const [saindo, setSaindo] = useState(false);
  // As funções do Layout mudam a cada render: guardadas aqui, os timers não recomeçam.
  const avisos = useRef({ aoSair, aoTerminar });
  avisos.current = { aoSair, aoTerminar };

  const c = painel ? contarPorStatus(painel.agentes) : null;
  const emLigacao = useContagem(c ? c.ATENDENDO : null, 1550);
  const livres = useContagem(c ? c.LIVRE : null, 1710);
  const emPausa = useContagem(c ? c.PAUSA : null, 1870);
  const palavras = `${saudacao()}${nome ? `, ${primeiroNome(nome)}` : ''}`.split(' ');

  useEffect(() => {
    if (saindo) {
      avisos.current.aoSair();
      const id = setTimeout(() => avisos.current.aoTerminar(), SAIDA_MS);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setSaindo(true), DURACAO_MS);
    const pular = () => setSaindo(true);
    window.addEventListener('keydown', pular);
    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', pular);
    };
  }, [saindo]);

  const selos = [
    painel && (
      <span key="a" className={clsx('en-selo', painel.argusOnline ? 'en-ok' : 'en-fora')}>
        <span className="en-ponto" aria-hidden="true" />
        {painel.argusOnline ? 'Argus conectada' : 'Argus fora do ar'}
      </span>
    ),
    emLigacao != null && (
      <span key="l" className="en-selo">
        <b>{emLigacao}</b> em ligação
      </span>
    ),
    livres != null && (
      <span key="v" className="en-selo">
        <b>{livres}</b> {livres === 1 ? 'livre' : 'livres'}
      </span>
    ),
    emPausa != null && (
      <span key="p" className="en-selo">
        <b>{emPausa}</b> em pausa
      </span>
    ),
  ].filter(Boolean);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setSaindo(true)}
      className={clsx('en-fundo', saindo && 'en-saindo')}
    >
      <div className="en-brilho" aria-hidden="true" />
      <div className="en-brilho en-brilho-2" aria-hidden="true" />
      <div className={clsx('relative grid justify-items-center gap-6', saindo && 'en-expandir')}>
        <div className="inline-flex items-center">
          <div className="en-icone relative size-16 flex-none">
            {/* ondas saindo do olho: ele vigia o salão inteiro */}
            <span className="en-onda" aria-hidden="true" />
            <span className="en-onda" style={{ animationDelay: '0.55s' }} aria-hidden="true" />
            <span className="en-onda" style={{ animationDelay: '1.1s' }} aria-hidden="true" />
            <Olho />
          </div>
          <span className="en-abre inline-block overflow-hidden">
            <span className="en-palavra inline-block whitespace-nowrap pl-4 text-left leading-none">
              <span className="block font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
                Ben<span className="text-[#F5C400]">Heimdall</span>
              </span>
              <span className="mt-1.5 block text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
                Painel de Atendimento
              </span>
            </span>
          </span>
        </div>
        <p className="font-display text-2xl font-semibold sm:text-3xl" aria-label={palavras.join(' ')}>
          {palavras.map((p, i) => (
            // O espaço fica fora do inline-block (dentro dele, o navegador o descarta).
            <Fragment key={i}>
              {i > 0 && ' '}
              <span
                className="en-surgir inline-block"
                style={{ animationDelay: `${1.05 + i * 0.09}s` }}
                aria-hidden="true"
              >
                {p}
              </span>
            </Fragment>
          ))}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {selos.map((selo, i) => (
            <span key={i} className="en-pulo inline-block" style={{ animationDelay: `${1.35 + i * 0.16}s` }}>
              {selo}
            </span>
          ))}
        </div>
      </div>
      <div className={clsx('en-rodape', saindo && 'opacity-0')}>
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <div className="en-progresso" style={{ animationDuration: `${DURACAO_MS}ms` }} />
        </div>
        <span className="text-xs text-white/60">clique ou aperte uma tecla para pular</span>
      </div>
    </div>
  );
}
