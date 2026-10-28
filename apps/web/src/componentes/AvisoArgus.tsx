import { segundosDesde, type Painel } from '@benheimdall/shared';

/** Aviso fixo enquanto a Argus estiver fora: os dados na tela são da última leitura. */
export function AvisoArgus({ painel, agora }: { painel: Painel | undefined; agora: number }) {
  if (!painel || painel.argusOnline) return null;
  const nuncaLeu = painel.agentes.length === 0;
  return (
    <div className="banner show" role="alert">
      {nuncaLeu
        ? 'Sem conexão com a Argus. Ainda não foi possível fazer a primeira leitura; o painel tenta de novo sozinho.'
        : `Sem conexão com a Argus. Os dados são da última leitura, feita há ${segundosDesde(painel.ultimaLeituraArgus, agora)} s. O painel volta sozinho quando a conexão retornar.`}
    </div>
  );
}
