export interface WorkspaceProject {projectId:string;name:string;canonicalPath:string;aliases?:string[];}
export interface WorkspaceSource {sourceId:string;projectId:string;directory:string;sourceVersion:string;staleAfterMs:number;}
export interface WorkspaceConfig {schemaVersion:'1.0';vscodeVersion:string;projects:WorkspaceProject[];sources:WorkspaceSource[];}
export interface WorkspaceLease {schemaVersion:'1.0';sourceVersion:string;vscodeVersion:string;windowKey:string;publisherId:string;cwdHash:string;state:'opened'|'closed';sequence:number;observedAt:string;}
export const SOURCE_VERSION:string;
export function hash(text:string):string;
export function normalize(path:string):string;
export function parseWorkspaceConfig(input:unknown):WorkspaceConfig;
export function readWorkspaceConfig(filename:string):WorkspaceConfig;
export function readLease(filename:string):unknown;
export function validateLease(input:unknown,config:WorkspaceConfig,source:WorkspaceSource,windowKey:string,now:number):input is WorkspaceLease;
