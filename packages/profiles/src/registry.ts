import { defaultJellyfinMovieProfile } from './jellyfin/jellyfin-profile';
import type { MovieOutputProfile } from './types';

const PROFILES: Record<string, MovieOutputProfile> = {
  jellyfin: defaultJellyfinMovieProfile,
};

export function getMovieProfile(name: string): MovieOutputProfile | undefined {
  return PROFILES[name.toLowerCase().trim()];
}

export function registerMovieProfile(profile: MovieOutputProfile): void {
  PROFILES[profile.name.toLowerCase().trim()] = profile;
}

export function listSupportedProfiles(): string[] {
  return Object.keys(PROFILES);
}
