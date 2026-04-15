export type PokemonRarity = "common" | "uncommon" | "rare" | "legendary";

export interface PokemonEntry {
  name: string;
  rarity: PokemonRarity;
}

export const POKEMON_CATALOG: PokemonEntry[] = [
  { name: "Pidgey", rarity: "common" },
  { name: "Rattata", rarity: "common" },
  { name: "Caterpie", rarity: "common" },
  { name: "Weedle", rarity: "common" },
  { name: "Zubat", rarity: "common" },
  { name: "Oddish", rarity: "common" },
  { name: "Poliwag", rarity: "common" },
  { name: "Magikarp", rarity: "common" },
  { name: "Psyduck", rarity: "common" },
  { name: "Bellsprout", rarity: "common" },
  { name: "Eevee", rarity: "uncommon" },
  { name: "Pikachu", rarity: "uncommon" },
  { name: "Growlithe", rarity: "uncommon" },
  { name: "Vulpix", rarity: "uncommon" },
  { name: "Machop", rarity: "uncommon" },
  { name: "Abra", rarity: "uncommon" },
  { name: "Gastly", rarity: "uncommon" },
  { name: "Onix", rarity: "uncommon" },
  { name: "Dratini", rarity: "rare" },
  { name: "Lapras", rarity: "rare" },
  { name: "Snorlax", rarity: "rare" },
  { name: "Scyther", rarity: "rare" },
  { name: "Gengar", rarity: "rare" },
  { name: "Charizard", rarity: "rare" },
  { name: "Dragonite", rarity: "legendary" },
  { name: "Mew", rarity: "legendary" },
  { name: "Mewtwo", rarity: "legendary" },
  { name: "Zapdos", rarity: "legendary" },
  { name: "Articuno", rarity: "legendary" },
  { name: "Moltres", rarity: "legendary" }
];
