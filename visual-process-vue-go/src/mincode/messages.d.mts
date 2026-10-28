export type PluginLocale = 'zh' | 'en';
export type PluginMessageCatalog = Record<string, string>;

export declare const messages: Record<PluginLocale, PluginMessageCatalog>;
export declare function normalizeLocale(locale: unknown): PluginLocale;
export declare function pluginMessages(locale: unknown): PluginMessageCatalog;
export declare const pluginLocaleKey: unique symbol;
