export * from './tipos';
export * from './criar';
export { MockArgusClient, type MockArgusOpcoes } from './mock/MockArgusClient';
export { RealArgusClient, ArgusLimiteError, nomeProprio, type RealArgusOpcoes } from './real/RealArgusClient';
export {
  classificarStatus,
  normalizarTexto,
  TEXTOS_STATUS_PADRAO,
  type TextosStatus,
} from './real/classificar';
export { distribuirBaias, numerarEquipes, type Baia } from './real/salao';
