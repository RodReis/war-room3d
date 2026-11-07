import type { CommandAdapter } from '../types.ts';
/** Sem prova Windows vinculada à versão/sessão: não instalar hook nem invocar CLI. */
export const claudeCommands:CommandAdapter={provider:'claude',version:'unavailable-1',actions:[],
  async send(){throw new Error('capability_unavailable');}};
