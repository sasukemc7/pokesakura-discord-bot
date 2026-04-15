const artworkCache = new Map<string, string | null>();

function normalizePokemonName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/\s+/g, "-");
}

export async function getPokemonArtwork(name: string): Promise<string | null> {
  const key = normalizePokemonName(name);

  if (artworkCache.has(key)) {
    return artworkCache.get(key) ?? null;
  }

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(key)}`);
    if (!response.ok) {
      artworkCache.set(key, null);
      return null;
    }

    const data = await response.json() as {
      sprites?: {
        front_default?: string | null;
        other?: {
          [key: string]: {
            front_default?: string | null;
          };
        };
      };
    };

    const officialArtwork = data.sprites?.other?.["official-artwork"]?.front_default;
    const defaultSprite = data.sprites?.front_default;
    const image = officialArtwork ?? defaultSprite ?? null;

    artworkCache.set(key, image);
    return image;
  } catch {
    artworkCache.set(key, null);
    return null;
  }
}
