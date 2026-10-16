interface SpriteImage {
  src: string;
  onload: ((...args: any[]) => void) | null;
  onerror: ((...args: any[]) => void) | null;
  decode?: () => Promise<void>;
}
export function createSpriteTextureCache(createImage: () => SpriteImage, timeoutMs?: number): {
  loadAll(urls: string[]): Promise<void[]>;
  isReady(urls: string[]): boolean;
};
