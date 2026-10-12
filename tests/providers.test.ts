import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../src/lib/providers/ProviderRegistry';
import { OpenLicensedProvider } from '../src/lib/providers/OpenLicensedProvider';
import { CommercialHandoffProvider } from '../src/lib/providers/CommercialHandoffProvider';

describe('Catalogue Provider Adapters and Legal Declarations', () => {
  it('registers all required default catalogue providers', () => {
    const providers = ProviderRegistry.getAll();
    expect(providers.length).toBeGreaterThanOrEqual(3);

    const codes = providers.map((p) => p.code);
    expect(codes).toContain('private_library');
    expect(codes).toContain('indian_music_vault');
    expect(codes).toContain('audius_online');
    expect(codes).toContain('open_licensed');
    expect(codes).toContain('commercial_handoff');
  });

  it('commercial handoff provider explicitly declares lack of full-track playback permission', () => {
    const handoff = new CommercialHandoffProvider();
    expect(handoff.capabilities.canPlayFullTracks).toBe(false);
    expect(handoff.capabilities.canDownloadCache).toBe(false);
    expect(handoff.getTermsNotice()).toContain('Official provider handoff');
  });

  it('open licensed provider declares full playback capability and CC licensing', () => {
    const open = new OpenLicensedProvider();
    expect(open.capabilities.canPlayFullTracks).toBe(true);
    expect(open.capabilities.canDownloadCache).toBe(true);
    expect(open.getTermsNotice()).toContain('Creative Commons');
  });

  it('search across open-licensed catalogue returns matched items with audio assets', async () => {
    const open = new OpenLicensedProvider();
    const result = await open.search('Aura');

    expect(result.tracks.length).toBeGreaterThan(0);
    expect(result.tracks[0].assets.length).toBeGreaterThan(0);
    expect(result.tracks[0].assets[0].codec).toBe('FLAC');
  });
});
