import type { CommandAdapter } from '../types.ts';
/** Fila ou protocolo de outra aplicação não comprova controle da sessão observada. */
export const codexCommands:CommandAdapter={provider:'codex',version:'unavailable-1',actions:[],
  async send(){throw new Error('capability_unavailable');}};
