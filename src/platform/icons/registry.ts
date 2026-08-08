import type { IconProvider, IconRegistry } from "./types";

export function createIconRegistry(initialProviders: readonly IconProvider[] = []): IconRegistry {
  const providers = new Map(initialProviders.map((provider) => [provider.id, provider]));

  return {
    get: (providerId) => providers.get(providerId),
    list: () => [...providers.values()],
    register: (provider) => {
      providers.set(provider.id, provider);
    },
    unregister: (providerId) => {
      providers.delete(providerId);
    },
  };
}
