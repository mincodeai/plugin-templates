export type ConnectionEnvironment = 'dev' | 'test' | 'staging' | 'prod';
export interface ConnectionMeta { group?: string; environment?: string }
export type ConnectionMetaMap = Record<string, ConnectionMeta>;
export interface ConnectionProfile { id: string; name: string; [key: string]: unknown }
export interface ConnectionGroupItem<P extends ConnectionProfile = ConnectionProfile> { profile: P; group: string; environment: string }
export interface ConnectionGroup<P extends ConnectionProfile = ConnectionProfile> { name: string; items: ConnectionGroupItem<P>[] }
export interface PendingConnectionMeta { name: string; group: string; environment: string }
export interface ConnectionMetaAssignment { id: string; group: string; environment: string }

export declare const ENVIRONMENTS: readonly ConnectionEnvironment[];
/** Unknown or empty environments return '', which Element Plus treats as its default tag. */
export declare function environmentTagType(env: unknown): 'info' | 'primary' | 'warning' | 'danger' | undefined;
export declare function groupConnections<P extends ConnectionProfile>(
  profiles: readonly P[],
  meta: ConnectionMetaMap,
  options?: { query?: string; locale?: string; detail?: (profile: P) => string },
): ConnectionGroup<P>[];
export declare function groupNames(meta: ConnectionMetaMap, locale?: string): string[];
export declare function withMeta<T extends { id?: string }>(exported: readonly T[], meta: ConnectionMetaMap): (T & ConnectionMeta)[];
export declare function metaFromImport<T>(items: readonly T[]): { items: T[]; pending: PendingConnectionMeta[] };
export declare function metaAssignments(pending: readonly PendingConnectionMeta[], profiles: readonly ConnectionProfile[]): ConnectionMetaAssignment[];
