const loadedImages = new Set<string>();

export function isImageLoaded(url: string): boolean {
  return loadedImages.has(url);
}

export function preloadImage(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (!url) {
      resolve("");
      return;
    }

    if (loadedImages.has(url)) {
      resolve(url);
      return;
    }

    const img = new Image();
    img.onload = () => {
      loadedImages.add(url);
      resolve(url);
    };
    img.onerror = () => {
      resolve("");
    };
    img.src = url;
  });
}

export async function preloadImages(urls: string[]): Promise<string[]> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const results = await Promise.all(unique.map(preloadImage));
  return results.filter((u): u is string => !!u);
}

export function clearImageCache() {
  loadedImages.clear();
}
