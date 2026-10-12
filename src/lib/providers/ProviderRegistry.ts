import { CatalogueProvider, ProviderSearchResult } from './types';
import { PrivateLibraryProvider } from './PrivateLibraryProvider';
import { OpenLicensedProvider } from './OpenLicensedProvider';
import { CommercialHandoffProvider } from './CommercialHandoffProvider';
import { AudiusProvider } from './AudiusProvider';

class ProviderRegistryClass {
  private providers: Map<string, CatalogueProvider> = new Map();

  constructor() {
    this.register(new PrivateLibraryProvider());
    this.register(new AudiusProvider());
    this.register(new OpenLicensedProvider());
    this.register(new CommercialHandoffProvider());
  }

  public register(provider: CatalogueProvider) {
    this.providers.set(provider.code, provider);
  }

  public get(code: string): CatalogueProvider | undefined {
    return this.providers.get(code);
  }

  public getAll(): CatalogueProvider[] {
    return Array.from(this.providers.values());
  }

  public async searchAll(query: string): Promise<ProviderSearchResult[]> {
    const active = this.getAll();
    const results = await Promise.allSettled(
      active.map((provider) => provider.search(query))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<ProviderSearchResult> => r.status === 'fulfilled')
      .map((r) => r.value);
  }
}

export const ProviderRegistry = new ProviderRegistryClass();
