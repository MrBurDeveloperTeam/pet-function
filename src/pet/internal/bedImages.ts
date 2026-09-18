import { PET_ASSET_URLS } from '../../resources';

export function resolveBedImage(id: string, customUrl?: string, overrides?: { grey?: string; red?: string; purple?: string }) {
  switch (id) {
    case 'bed_grey': return overrides?.grey || PET_ASSET_URLS.beds.grey;
    case 'bed_red': return overrides?.red || PET_ASSET_URLS.beds.red;
    case 'bed_purple': return overrides?.purple || PET_ASSET_URLS.beds.purple;
    default: return customUrl?.trim() || PET_ASSET_URLS.beds.grey;
  }
}

// Last-resort inline artwork needs no network request or host file.
export const BED_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 140"><rect x="10" y="50" width="260" height="80" rx="36" fill="#aeb8ca"/><ellipse cx="140" cy="70" rx="110" ry="42" fill="#e4e8f1"/><ellipse cx="140" cy="74" rx="86" ry="28" fill="#c9d1e0"/></svg>');

export function bedImageCandidates(src: string) {
  return [...new Set([src, PET_ASSET_URLS.beds.grey, BED_PLACEHOLDER])];
}
