import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction
} from "discord.js";
import type Database from "better-sqlite3";
import type { BotConfig } from "../config/types";
import { BotDatabase } from "../db/database";
import { POKEMON_CATALOG, PokemonEntry, PokemonRarity } from "./pokemonCatalog";
import { getPokemonArtwork } from "./pokemonApi";

interface UserPokemonRow {
  id: number;
  pokemon_name: string;
  rarity: string;
  level: number;
  xp: number;
  nickname: string | null;
}

export class PokemonService {
  private readonly db: Database.Database;

  public constructor(
    private readonly config: BotConfig,
    database: BotDatabase
  ) {
    this.db = database.raw();
  }

  public async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Este comando solo funciona en servidor.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!this.config.pokemon.enabled) {
      await interaction.reply({ content: "Sistema Pokemon deshabilitado en config.", flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "starter") {
      await this.handleStarter(interaction);
      return;
    }

    if (sub === "catch") {
      await this.handleCatch(interaction);
      return;
    }

    if (sub === "party") {
      await this.handleParty(interaction);
      return;
    }

    if (sub === "active") {
      await this.handleActive(interaction);
      return;
    }

    if (sub === "train") {
      await this.handleTrain(interaction);
      return;
    }

    if (sub === "profile") {
      await this.handleProfile(interaction);
      return;
    }

    await interaction.reply({ content: "Subcomando Pokemon no soportado.", flags: MessageFlags.Ephemeral });
  }

  public async onSelectMenu(interaction: StringSelectMenuInteraction): Promise<boolean> {
    if (interaction.customId !== "pokemon:train:select") {
      return false;
    }

    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Este menu solo funciona en servidor.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const selectedId = Number(interaction.values[0]);
    if (!Number.isFinite(selectedId) || selectedId <= 0) {
      await interaction.reply({ content: "Pokemon invalido para entrenar.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const row = this.db
      .prepare(
        "SELECT id, pokemon_name, rarity, level, xp, nickname FROM pokemon_collection WHERE id = ? AND user_id = ? AND guild_id = ? LIMIT 1"
      )
      .get(selectedId, interaction.user.id, interaction.guildId) as UserPokemonRow | undefined;

    if (!row) {
      await interaction.reply({ content: "No puedes entrenar ese Pokemon.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const cooldown = this.getCooldownRemaining(
      interaction.user.id,
      "last_train_at",
      this.config.pokemon.economy.trainCooldownMinutes
    );

    if (cooldown > 0) {
      await interaction.reply({
        content: `Debes esperar ${cooldown} minutos para volver a entrenar.`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    const imageUrl = await getPokemonArtwork(row.pokemon_name);

    const startEmbed = new EmbedBuilder()
      .setColor("#f59e0b")
      .setTitle(`Entrenando a ${row.nickname ?? row.pokemon_name}`)
      .setDescription([
        "Progreso de entrenamiento:",
        `${this.progressBar(1, 3)} Calentando...`,
        `${this.progressBar(2, 3)} Sparring...`,
        `${this.progressBar(3, 3)} Recuperacion...`
      ].join("\n"))
      .setFooter({ text: "El entrenamiento esta en curso..." });

    if (imageUrl) {
      startEmbed.setThumbnail(imageUrl);
    }

    await interaction.update({ embeds: [startEmbed], components: [] });
    await this.delay(700);

    const gainedXp = this.randomInt(this.config.pokemon.xp.trainMin, this.config.pokemon.xp.trainMax);
    let newXp = row.xp + gainedXp;
    let newLevel = row.level;

    while (newXp >= this.requiredXpForLevel(newLevel)) {
      newXp -= this.requiredXpForLevel(newLevel);
      newLevel += 1;
    }

    this.db
      .prepare("UPDATE pokemon_collection SET level = ?, xp = ? WHERE id = ?")
      .run(newLevel, newXp, row.id);

    this.db
      .prepare("UPDATE pokemon_users SET last_train_at = datetime('now') WHERE user_id = ?")
      .run(interaction.user.id);

    const finalEmbed = new EmbedBuilder()
      .setColor("#22c55e")
      .setTitle(`Entrenamiento completado: ${row.nickname ?? row.pokemon_name}`)
      .setDescription([
        `+${gainedXp} XP ganados`,
        `Nivel actual: **${newLevel}**`,
        `XP actual: **${newXp}/${this.requiredXpForLevel(newLevel)}**`
      ].join("\n"))
      .addFields(
        { name: "Rareza", value: row.rarity, inline: true },
        { name: "ID", value: String(row.id), inline: true }
      )
      .setFooter({ text: "Tip: usa /pokemon active para definir tu principal" })
      .setTimestamp();

    if (imageUrl) {
      finalEmbed.setImage(imageUrl);
    }

    await interaction.editReply({ embeds: [finalEmbed], components: [] });
    return true;
  }

  private ensureUser(userId: string, guildId: string): void {
    this.db
      .prepare(
        `INSERT INTO pokemon_users (user_id, guild_id, active_pokemon_id, last_catch_at, last_train_at, created_at)
         VALUES (?, ?, NULL, NULL, NULL, datetime('now'))
         ON CONFLICT(user_id) DO NOTHING`
      )
      .run(userId, guildId);
  }

  private userHasPokemon(userId: string, guildId: string): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM pokemon_collection WHERE user_id = ? AND guild_id = ?")
      .get(userId, guildId) as { count: number };
    return row.count > 0;
  }

  private async handleStarter(interaction: ChatInputCommandInteraction): Promise<void> {
    const selected = interaction.options.getString("pokemon", true);
    if (!this.config.pokemon.starters.includes(selected)) {
      await interaction.reply({
        content: `Debes elegir uno de: ${this.config.pokemon.starters.join(", ")}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    this.ensureUser(interaction.user.id, interaction.guildId as string);
    if (this.userHasPokemon(interaction.user.id, interaction.guildId as string)) {
      await interaction.reply({ content: "Ya tienes Pokemon, no puedes elegir otro inicial.", flags: MessageFlags.Ephemeral });
      return;
    }

    const insert = this.db.prepare(
      `INSERT INTO pokemon_collection
       (user_id, guild_id, pokemon_name, rarity, level, xp, is_starter, nickname, created_at)
       VALUES (?, ?, ?, 'rare', 5, 0, 1, NULL, datetime('now'))`
    );

    const info = insert.run(interaction.user.id, interaction.guildId as string, selected);
    this.db
      .prepare("UPDATE pokemon_users SET active_pokemon_id = ? WHERE user_id = ?")
      .run(Number(info.lastInsertRowid), interaction.user.id);

    const imageUrl = await getPokemonArtwork(selected);
    const embed = new EmbedBuilder()
      .setColor("#a855f7")
      .setTitle("Pokemon inicial elegido")
      .setDescription(`Elegiste a **${selected}** como tu primer companero.`)
      .setFooter({ text: "Buena suerte en tu aventura" })
      .setTimestamp();

    if (imageUrl) {
      embed.setImage(imageUrl);
    }

    await interaction.reply({ embeds: [embed] });
  }

  private async handleCatch(interaction: ChatInputCommandInteraction): Promise<void> {
    this.ensureUser(interaction.user.id, interaction.guildId as string);
    if (!this.userHasPokemon(interaction.user.id, interaction.guildId as string)) {
      await interaction.reply({ content: this.config.pokemon.messages.noStarter, flags: MessageFlags.Ephemeral });
      return;
    }

    const cooldown = this.getCooldownRemaining(
      interaction.user.id,
      "last_catch_at",
      this.config.pokemon.economy.catchCooldownMinutes
    );

    if (cooldown > 0) {
      await interaction.reply({ content: `Debes esperar ${cooldown} minutos para capturar de nuevo.`, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();

    const searchingEmbed = new EmbedBuilder()
      .setColor("#0ea5e9")
      .setTitle("Captura en proceso")
      .setDescription([
        "Capturando pokemon...",
        `${this.progressBar(1, 3)} Explorando zona`,
        `${this.progressBar(2, 3)} Localizando objetivo`,
        `${this.progressBar(3, 3)} Lanzando pokeball`
      ].join("\n"))
      .setFooter({ text: "No cierres la pokedex..." });

    await interaction.editReply({ embeds: [searchingEmbed] });
    await this.delay(900);

    const rarity = this.rollRarity();
    const pool = POKEMON_CATALOG.filter((pokemon) => pokemon.rarity === rarity);
    const selected = pool[Math.floor(Math.random() * pool.length)] ?? this.randomPokemon();
    const imageUrl = await getPokemonArtwork(selected.name);

    this.db
      .prepare(
        `INSERT INTO pokemon_collection
         (user_id, guild_id, pokemon_name, rarity, level, xp, is_starter, nickname, created_at)
         VALUES (?, ?, ?, ?, 1, 0, 0, NULL, datetime('now'))`
      )
      .run(interaction.user.id, interaction.guildId as string, selected.name, selected.rarity);

    this.db
      .prepare("UPDATE pokemon_users SET last_catch_at = datetime('now') WHERE user_id = ?")
      .run(interaction.user.id);

    const text = this.config.pokemon.messages.catchSuccess
      .replace("{pokemon}", selected.name)
      .replace("{rarity}", selected.rarity);

    const resultEmbed = new EmbedBuilder()
      .setColor(this.rarityColor(selected.rarity))
      .setTitle(`Pokemon capturado: ${selected.name}`)
      .setDescription([text, "", `Rareza: **${selected.rarity}**`, "Estado: capturado con exito"].join("\n"))
      .setFooter({ text: "Usa /pokemon train para subir de nivel" })
      .setTimestamp();

    if (imageUrl) {
      resultEmbed.setImage(imageUrl);
    }

    await interaction.editReply({ embeds: [resultEmbed] });
  }

  private async handleParty(interaction: ChatInputCommandInteraction): Promise<void> {
    const rows = this.getUserPokemon(interaction.user.id, interaction.guildId as string);

    if (!rows.length) {
      await interaction.reply({ content: this.config.pokemon.messages.noStarter, flags: MessageFlags.Ephemeral });
      return;
    }

    const activeIdRow = this.db
      .prepare("SELECT active_pokemon_id FROM pokemon_users WHERE user_id = ? LIMIT 1")
      .get(interaction.user.id) as { active_pokemon_id: number | null } | undefined;

    const activePokemon = rows.find((row) => row.id === activeIdRow?.active_pokemon_id);

    const description = rows
      .map((row) => {
        const isActive = row.id === activeIdRow?.active_pokemon_id ? "⭐ " : "";
        return `${isActive}#${row.id} ${row.nickname ?? row.pokemon_name} | ${row.rarity} | Lv ${row.level} | XP ${row.xp}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor("#16a34a")
      .setTitle(`Equipo Pokemon de ${interaction.user.username}`)
      .setDescription(description)
      .setFooter({ text: "⭐ indica tu Pokemon activo" })
      .setTimestamp();

    if (activePokemon) {
      const imageUrl = await getPokemonArtwork(activePokemon.pokemon_name);
      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async handleActive(interaction: ChatInputCommandInteraction): Promise<void> {
    const id = interaction.options.getInteger("id", true);

    const row = this.db
      .prepare(
        "SELECT id, pokemon_name, rarity, level FROM pokemon_collection WHERE id = ? AND user_id = ? AND guild_id = ? LIMIT 1"
      )
      .get(id, interaction.user.id, interaction.guildId as string) as
      | { id: number; pokemon_name: string; rarity: string; level: number }
      | undefined;

    if (!row) {
      await interaction.reply({ content: "No tienes un Pokemon con ese ID.", flags: MessageFlags.Ephemeral });
      return;
    }

    this.db
      .prepare("UPDATE pokemon_users SET active_pokemon_id = ? WHERE user_id = ?")
      .run(row.id, interaction.user.id);

    const imageUrl = await getPokemonArtwork(row.pokemon_name);
    const embed = new EmbedBuilder()
      .setColor("#06b6d4")
      .setTitle("Pokemon activo actualizado")
      .setDescription(`Ahora tu Pokemon principal es **${row.pokemon_name}**.`)
      .addFields(
        { name: "Nivel", value: String(row.level), inline: true },
        { name: "Rareza", value: row.rarity, inline: true }
      );

    if (imageUrl) {
      embed.setThumbnail(imageUrl);
    }

    await interaction.reply({ embeds: [embed] });
  }

  private async handleTrain(interaction: ChatInputCommandInteraction): Promise<void> {
    const rows = this.getUserPokemon(interaction.user.id, interaction.guildId as string);

    if (!rows.length) {
      await interaction.reply({ content: "No tienes Pokemon para entrenar.", flags: MessageFlags.Ephemeral });
      return;
    }

    const options = rows.slice(0, 25).map((row) => ({
      label: `${row.nickname ?? row.pokemon_name} (Lv ${row.level})`,
      description: `Rareza: ${row.rarity} | XP: ${row.xp}`,
      value: String(row.id)
    }));

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("pokemon:train:select")
        .setPlaceholder("Selecciona el Pokemon que quieres entrenar")
        .addOptions(options)
    );

    const embed = new EmbedBuilder()
      .setColor("#f97316")
      .setTitle("Centro de entrenamiento")
      .setDescription("Elige que Pokemon quieres entrenar en este momento.")
      .setFooter({ text: "Solo tu puedes usar este selector" });

    await interaction.reply({ embeds: [embed], components: [selectRow], flags: MessageFlags.Ephemeral });
  }

  private async handleProfile(interaction: ChatInputCommandInteraction): Promise<void> {
    const stats = this.db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN rarity = 'legendary' THEN 1 ELSE 0 END) as legendary,
          MAX(level) as max_level
        FROM pokemon_collection
        WHERE user_id = ? AND guild_id = ?`
      )
      .get(interaction.user.id, interaction.guildId as string) as {
      total: number;
      legendary: number;
      max_level: number | null;
    };

    const active = this.db
      .prepare(
        `SELECT p.pokemon_name, p.level, p.rarity
         FROM pokemon_users u
         LEFT JOIN pokemon_collection p ON u.active_pokemon_id = p.id
         WHERE u.user_id = ? LIMIT 1`
      )
      .get(interaction.user.id) as { pokemon_name: string; level: number; rarity: string } | undefined;

    const embed = new EmbedBuilder()
      .setColor("#0ea5e9")
      .setTitle(`Perfil Pokemon de ${interaction.user.username}`)
      .addFields(
        { name: "Total capturados", value: String(stats.total ?? 0), inline: true },
        { name: "Legendarios", value: String(stats.legendary ?? 0), inline: true },
        { name: "Nivel maximo", value: String(stats.max_level ?? 0), inline: true },
        {
          name: "Pokemon activo",
          value: active ? `${active.pokemon_name} (Lv ${active.level}, ${active.rarity})` : "Ninguno"
        }
      )
      .setTimestamp();

    if (active) {
      const imageUrl = await getPokemonArtwork(active.pokemon_name);
      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private requiredXpForLevel(level: number): number {
    return Math.max(20, Math.floor(this.config.pokemon.xp.levelCurveBase * Math.pow(1.08, level - 1)));
  }

  private getCooldownRemaining(userId: string, field: "last_catch_at" | "last_train_at", minutes: number): number {
    const row = this.db
      .prepare(`SELECT ${field} as value FROM pokemon_users WHERE user_id = ? LIMIT 1`)
      .get(userId) as { value: string | null } | undefined;

    if (!row?.value) {
      return 0;
    }

    const last = new Date(row.value).getTime();
    const now = Date.now();
    const diffMinutes = (now - last) / 1000 / 60;
    const remaining = Math.ceil(minutes - diffMinutes);
    return Math.max(0, remaining);
  }

  private rollRarity(): PokemonRarity {
    const weights = this.config.pokemon.rarityWeights;
    const total = weights.common + weights.uncommon + weights.rare + weights.legendary;
    const roll = Math.random() * total;

    if (roll < weights.common) {
      return "common";
    }
    if (roll < weights.common + weights.uncommon) {
      return "uncommon";
    }
    if (roll < weights.common + weights.uncommon + weights.rare) {
      return "rare";
    }
    return "legendary";
  }

  private randomPokemon(): PokemonEntry {
    return POKEMON_CATALOG[Math.floor(Math.random() * POKEMON_CATALOG.length)] as PokemonEntry;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getUserPokemon(userId: string, guildId: string): UserPokemonRow[] {
    return this.db
      .prepare(
        "SELECT id, pokemon_name, rarity, level, xp, nickname FROM pokemon_collection WHERE user_id = ? AND guild_id = ? ORDER BY level DESC, id DESC LIMIT 20"
      )
      .all(userId, guildId) as UserPokemonRow[];
  }

  private progressBar(step: number, total: number): string {
    const done = "■".repeat(Math.max(0, Math.min(step, total)));
    const pending = "□".repeat(Math.max(0, total - step));
    return `[${done}${pending}]`;
  }

  private rarityColor(rarity: PokemonRarity): `#${string}` {
    const colors: Record<PokemonRarity, `#${string}`> = {
      common: "#94a3b8",
      uncommon: "#22c55e",
      rare: "#3b82f6",
      legendary: "#f59e0b"
    };
    return colors[rarity];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
