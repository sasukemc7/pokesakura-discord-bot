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
  rarity: PokemonRarity;
  level: number;
  xp: number;
  nickname: string | null;
  is_shiny: number | null;
  nature: string | null;
  title: string | null;
  iv_hp: number | null;
  iv_atk: number | null;
  iv_def: number | null;
  iv_spatk: number | null;
  iv_spdef: number | null;
  iv_speed: number | null;
  bond: number | null;
}

interface PokemonMetaRow {
  pokemon_id: number;
  is_shiny: number;
  nature: string;
  title: string;
  iv_hp: number;
  iv_atk: number;
  iv_def: number;
  iv_spatk: number;
  iv_spdef: number;
  iv_speed: number;
  bond: number;
}

interface TrainerStatsRow {
  user_id: string;
  guild_id: string;
  catches: number;
  trains: number;
  shiny_catches: number;
  points: number;
  best_level: number;
  streak_days: number;
  last_catch_day: string | null;
}

interface DailyMissionRow {
  user_id: string;
  guild_id: string;
  mission_day: string;
  target_catches: number;
  target_trains: number;
  progress_catches: number;
  progress_trains: number;
  reward_points: number;
  claimed: number;
}

const NATURES = [
  "Hardy",
  "Brave",
  "Adamant",
  "Jolly",
  "Bold",
  "Calm",
  "Timid",
  "Modest",
  "Naughty",
  "Docile",
  "Quirky",
  "Careful"
];

const TITLES_BY_RARITY: Record<PokemonRarity, string[]> = {
  common: ["de Ruta", "de Pradera", "de Brisa", "Errante"],
  uncommon: ["Veloz", "Filo Lunar", "Centella", "de Aura"],
  rare: ["Arcano", "de Elite", "Tempestad", "Draconico"],
  legendary: ["Primordial", "Eterno", "Celestial", "Soberano"]
};

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
    if (sub === "info") {
      await this.handleInfo(interaction);
      return;
    }
    if (sub === "leaderboard") {
      await this.handleLeaderboard(interaction);
      return;
    }
    if (sub === "missions") {
      await this.handleMissions(interaction);
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
        "SELECT id, pokemon_name, rarity, level, xp, nickname, is_shiny, nature, title, iv_hp, iv_atk, iv_def, iv_spatk, iv_spdef, iv_speed, bond FROM pokemon_collection p LEFT JOIN pokemon_meta m ON m.pokemon_id = p.id WHERE p.id = ? AND p.user_id = ? AND p.guild_id = ? LIMIT 1"
      )
      .get(selectedId, interaction.user.id, interaction.guildId) as UserPokemonRow | undefined;

    if (!row) {
      await interaction.reply({ content: "No puedes entrenar ese Pokemon.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const completeRow = this.ensureMetaForPokemon(row.id, row.pokemon_name, row.rarity, false, row);

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

    const imageUrl = await getPokemonArtwork(completeRow.pokemon_name);

    const startEmbed = new EmbedBuilder()
      .setColor("#f59e0b")
      .setTitle(`Entrenando a ${completeRow.nickname ?? completeRow.pokemon_name}`)
      .setDescription([
        "Progreso de entrenamiento:",
        `${this.progressBar(1, 4)} Calentamiento`,
        `${this.progressBar(2, 4)} Tecnica`,
        `${this.progressBar(3, 4)} Resistencia`,
        `${this.progressBar(4, 4)} Concentracion`
      ].join("\n"))
      .setFooter({ text: "Tu Pokemon se esta esforzando..." });

    if (imageUrl) {
      startEmbed.setThumbnail(imageUrl);
    }

    await interaction.update({ embeds: [startEmbed], components: [] });
    await this.delay(900);

    const gainedXp = this.randomInt(this.config.pokemon.xp.trainMin, this.config.pokemon.xp.trainMax);
    let newXp = completeRow.xp + gainedXp;
    let newLevel = completeRow.level;

    while (newXp >= this.requiredXpForLevel(newLevel)) {
      newXp -= this.requiredXpForLevel(newLevel);
      newLevel += 1;
    }

    const bondGain = this.randomInt(1, 4);
    const updatedBond = Math.min(100, (completeRow.bond ?? 0) + bondGain);

    this.db
      .prepare("UPDATE pokemon_collection SET level = ?, xp = ? WHERE id = ?")
      .run(newLevel, newXp, completeRow.id);

    this.db
      .prepare("UPDATE pokemon_meta SET bond = ? WHERE pokemon_id = ?")
      .run(updatedBond, completeRow.id);

    this.db
      .prepare("UPDATE pokemon_users SET last_train_at = datetime('now') WHERE user_id = ?")
      .run(interaction.user.id);

    this.incrementTrainerStats(interaction.user.id, interaction.guildId, {
      trains: 1,
      points: 8 + Math.max(0, newLevel - completeRow.level),
      bestLevel: newLevel
    });

    this.incrementDailyMissionProgress(interaction.user.id, interaction.guildId, { trains: 1 });

    const finalEmbed = new EmbedBuilder()
      .setColor("#22c55e")
      .setTitle(`Entrenamiento completado: ${completeRow.nickname ?? completeRow.pokemon_name}`)
      .setDescription([
        `+${gainedXp} XP`,
        `Nivel: **${completeRow.level} -> ${newLevel}**`,
        `Vinculo: **${updatedBond}%** (+${bondGain})`,
        `Siguiente nivel: **${newXp}/${this.requiredXpForLevel(newLevel)} XP**`
      ].join("\n"))
      .addFields(
        { name: "Naturaleza", value: completeRow.nature ?? "Desconocida", inline: true },
        { name: "Titulo", value: completeRow.title ?? "Sin titulo", inline: true },
        { name: "Poder", value: String(this.powerScore(completeRow)), inline: true }
      )
      .setFooter({ text: "Tip: revisa tus misiones con /pokemon missions" })
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

    this.db
      .prepare(
        `INSERT INTO pokemon_trainer_stats (user_id, guild_id, catches, trains, shiny_catches, points, best_level, streak_days, last_catch_day, updated_at)
         VALUES (?, ?, 0, 0, 0, 0, 0, 0, NULL, datetime('now'))
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
    const pokemonId = Number(info.lastInsertRowid);

    this.db
      .prepare("UPDATE pokemon_users SET active_pokemon_id = ? WHERE user_id = ?")
      .run(pokemonId, interaction.user.id);

    const completeRow = this.ensureMetaForPokemon(pokemonId, selected, "rare", true);

    this.incrementTrainerStats(interaction.user.id, interaction.guildId as string, {
      catches: 1,
      points: 20,
      bestLevel: 5,
      shinyCatches: completeRow.is_shiny ? 1 : 0,
      countForStreak: true
    });

    this.incrementDailyMissionProgress(interaction.user.id, interaction.guildId as string, { catches: 1 });

    const imageUrl = await getPokemonArtwork(selected);
    const embed = new EmbedBuilder()
      .setColor("#a855f7")
      .setTitle("Pokemon inicial elegido")
      .setDescription([
        `Elegiste a **${selected}** como tu primer companero.`,
        `Naturaleza: **${completeRow.nature ?? "?"}**`,
        `Titulo: **${completeRow.title ?? "?"}**`,
        `Shiny: **${completeRow.is_shiny ? "Si" : "No"}**`
      ].join("\n"))
      .setFooter({ text: "Tu leyenda acaba de empezar" })
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
        "Escaneando bioma...",
        `${this.progressBar(1, 4)} Rastro detectado`,
        `${this.progressBar(2, 4)} Objetivo localizado`,
        `${this.progressBar(3, 4)} Preparando pokeball`,
        `${this.progressBar(4, 4)} Captura en curso`
      ].join("\n"))
      .setFooter({ text: "Respira... casi lo tienes" });

    await interaction.editReply({ embeds: [searchingEmbed] });
    await this.delay(1000);

    const rarity = this.rollRarity();
    const pool = POKEMON_CATALOG.filter((pokemon) => pokemon.rarity === rarity);
    const selected = pool[Math.floor(Math.random() * pool.length)] ?? this.randomPokemon();

    const insert = this.db
      .prepare(
        `INSERT INTO pokemon_collection
         (user_id, guild_id, pokemon_name, rarity, level, xp, is_starter, nickname, created_at)
         VALUES (?, ?, ?, ?, 1, 0, 0, NULL, datetime('now'))`
      )
      .run(interaction.user.id, interaction.guildId as string, selected.name, selected.rarity);

    const pokemonId = Number(insert.lastInsertRowid);
    const completeRow = this.ensureMetaForPokemon(pokemonId, selected.name, selected.rarity, false);

    this.db
      .prepare("UPDATE pokemon_users SET last_catch_at = datetime('now') WHERE user_id = ?")
      .run(interaction.user.id);

    this.incrementTrainerStats(interaction.user.id, interaction.guildId as string, {
      catches: 1,
      points: this.pointsByRarity(selected.rarity) + (completeRow.is_shiny ? 20 : 0),
      shinyCatches: completeRow.is_shiny ? 1 : 0,
      bestLevel: 1,
      countForStreak: true
    });

    this.incrementDailyMissionProgress(interaction.user.id, interaction.guildId as string, { catches: 1 });

    const text = this.config.pokemon.messages.catchSuccess
      .replace("{pokemon}", selected.name)
      .replace("{rarity}", selected.rarity);

    const imageUrl = await getPokemonArtwork(selected.name);

    const resultEmbed = new EmbedBuilder()
      .setColor(this.rarityColor(selected.rarity))
      .setTitle(`${completeRow.is_shiny ? "✨ " : ""}Pokemon capturado: ${selected.name}`)
      .setDescription([
        text,
        "",
        `Rareza: **${selected.rarity}**`,
        `Naturaleza: **${completeRow.nature ?? "?"}**`,
        `Titulo: **${completeRow.title ?? "?"}**`,
        `Poder base: **${this.powerScore(completeRow)}**`
      ].join("\n"))
      .setFooter({ text: "Usa /pokemon info para ver todos los detalles" })
      .setTimestamp();

    if (imageUrl) {
      resultEmbed.setImage(imageUrl);
    }

    await interaction.editReply({ embeds: [resultEmbed] });
  }

  private async handleParty(interaction: ChatInputCommandInteraction): Promise<void> {
    this.backfillMissingMeta(interaction.user.id, interaction.guildId as string);
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
        const shinyIcon = row.is_shiny ? "✨ " : "";
        return `${isActive}${shinyIcon}#${row.id} ${row.nickname ?? row.pokemon_name} | ${row.rarity} | Lv ${row.level} | Poder ${this.powerScore(row)}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor("#16a34a")
      .setTitle(`Equipo Pokemon de ${interaction.user.username}`)
      .setDescription(description)
      .setFooter({ text: "⭐ activo | ✨ shiny" })
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
        "SELECT p.id, p.pokemon_name, p.rarity, p.level, m.is_shiny FROM pokemon_collection p LEFT JOIN pokemon_meta m ON m.pokemon_id = p.id WHERE p.id = ? AND p.user_id = ? AND p.guild_id = ? LIMIT 1"
      )
      .get(id, interaction.user.id, interaction.guildId as string) as
      | { id: number; pokemon_name: string; rarity: PokemonRarity; level: number; is_shiny: number | null }
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
      .setDescription(`Ahora tu Pokemon principal es **${row.is_shiny ? "✨ " : ""}${row.pokemon_name}**.`)
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
    this.backfillMissingMeta(interaction.user.id, interaction.guildId as string);
    const rows = this.getUserPokemon(interaction.user.id, interaction.guildId as string);

    if (!rows.length) {
      await interaction.reply({ content: "No tienes Pokemon para entrenar.", flags: MessageFlags.Ephemeral });
      return;
    }

    const options = rows.slice(0, 25).map((row) => ({
      label: `${row.is_shiny ? "✨ " : ""}${row.nickname ?? row.pokemon_name} (Lv ${row.level})`,
      description: `Rareza: ${row.rarity} | Poder: ${this.powerScore(row)}`,
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
      .setDescription("Elige que Pokemon quieres entrenar en este momento.\nEl vinculo y el poder tambien suben.")
      .setFooter({ text: "Solo tu puedes usar este selector" });

    await interaction.reply({ embeds: [embed], components: [selectRow], flags: MessageFlags.Ephemeral });
  }

  private async handleProfile(interaction: ChatInputCommandInteraction): Promise<void> {
    this.ensureUser(interaction.user.id, interaction.guildId as string);

    const stats = this.getTrainerStats(interaction.user.id, interaction.guildId as string);

    const active = this.db
      .prepare(
        `SELECT p.pokemon_name, p.level, p.rarity, m.is_shiny
         FROM pokemon_users u
         LEFT JOIN pokemon_collection p ON u.active_pokemon_id = p.id
         LEFT JOIN pokemon_meta m ON m.pokemon_id = p.id
         WHERE u.user_id = ? LIMIT 1`
      )
      .get(interaction.user.id) as { pokemon_name: string; level: number; rarity: string; is_shiny: number | null } | undefined;

    const rank = this.trainerRank(stats.points);

    const embed = new EmbedBuilder()
      .setColor("#0ea5e9")
      .setTitle(`Perfil Pokemon de ${interaction.user.username}`)
      .addFields(
        { name: "Puntos", value: String(stats.points), inline: true },
        { name: "Rango", value: rank, inline: true },
        { name: "Racha", value: `${stats.streak_days} dias`, inline: true },
        { name: "Capturas", value: String(stats.catches), inline: true },
        { name: "Entrenamientos", value: String(stats.trains), inline: true },
        { name: "Shinies", value: String(stats.shiny_catches), inline: true },
        { name: "Nivel mas alto", value: String(stats.best_level), inline: true },
        {
          name: "Pokemon activo",
          value: active
            ? `${active.is_shiny ? "✨ " : ""}${active.pokemon_name} (Lv ${active.level}, ${active.rarity})`
            : "Ninguno"
        }
      )
      .setTimestamp();

    if (active?.pokemon_name) {
      const imageUrl = await getPokemonArtwork(active.pokemon_name);
      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async handleInfo(interaction: ChatInputCommandInteraction): Promise<void> {
    const id = interaction.options.getInteger("id", true);

    const row = this.db
      .prepare(
        "SELECT p.id, p.pokemon_name, p.rarity, p.level, p.xp, p.nickname, m.is_shiny, m.nature, m.title, m.iv_hp, m.iv_atk, m.iv_def, m.iv_spatk, m.iv_spdef, m.iv_speed, m.bond FROM pokemon_collection p LEFT JOIN pokemon_meta m ON m.pokemon_id = p.id WHERE p.id = ? AND p.user_id = ? AND p.guild_id = ? LIMIT 1"
      )
      .get(id, interaction.user.id, interaction.guildId as string) as UserPokemonRow | undefined;

    if (!row) {
      await interaction.reply({ content: "No tienes un Pokemon con ese ID.", flags: MessageFlags.Ephemeral });
      return;
    }

    const completeRow = this.ensureMetaForPokemon(row.id, row.pokemon_name, row.rarity, false, row);
    const imageUrl = await getPokemonArtwork(completeRow.pokemon_name);

    const embed = new EmbedBuilder()
      .setColor(this.rarityColor(completeRow.rarity))
      .setTitle(`${completeRow.is_shiny ? "✨ " : ""}${completeRow.nickname ?? completeRow.pokemon_name} | Ficha completa`)
      .setDescription([
        `ID: **${completeRow.id}**`,
        `Rareza: **${completeRow.rarity}**`,
        `Nivel: **${completeRow.level}**`,
        `XP: **${completeRow.xp}/${this.requiredXpForLevel(completeRow.level)}**`,
        `Naturaleza: **${completeRow.nature}**`,
        `Titulo: **${completeRow.title}**`,
        `Vinculo: **${completeRow.bond}%**`,
        `Poder total: **${this.powerScore(completeRow)}**`
      ].join("\n"))
      .addFields(
        { name: "HP", value: this.statBar(completeRow.iv_hp ?? 0, 31), inline: true },
        { name: "ATK", value: this.statBar(completeRow.iv_atk ?? 0, 31), inline: true },
        { name: "DEF", value: this.statBar(completeRow.iv_def ?? 0, 31), inline: true },
        { name: "SpA", value: this.statBar(completeRow.iv_spatk ?? 0, 31), inline: true },
        { name: "SpD", value: this.statBar(completeRow.iv_spdef ?? 0, 31), inline: true },
        { name: "SPD", value: this.statBar(completeRow.iv_speed ?? 0, 31), inline: true }
      )
      .setFooter({ text: `Tier: ${this.pokemonTier(completeRow)}` })
      .setTimestamp();

    if (imageUrl) {
      embed.setImage(imageUrl);
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async handleLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
    const rows = this.db
      .prepare(
        "SELECT user_id, points, catches, trains, shiny_catches, best_level, streak_days FROM pokemon_trainer_stats WHERE guild_id = ? ORDER BY points DESC, shiny_catches DESC LIMIT 10"
      )
      .all(interaction.guildId) as Array<{
      user_id: string;
      points: number;
      catches: number;
      trains: number;
      shiny_catches: number;
      best_level: number;
      streak_days: number;
    }>;

    if (!rows.length) {
      await interaction.reply({ content: "Aun no hay datos para el ranking.", flags: MessageFlags.Ephemeral });
      return;
    }

    const lines: string[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] as (typeof rows)[number];
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
      lines.push(`${medal} <@${row.user_id}> | ${row.points} pts | ✨${row.shiny_catches} | LvMax ${row.best_level} | Racha ${row.streak_days}`);
    }

    const embed = new EmbedBuilder()
      .setColor("#facc15")
      .setTitle("Pokemon League - Ranking del servidor")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "Sigue capturando y entrenando para subir" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  private async handleMissions(interaction: ChatInputCommandInteraction): Promise<void> {
    this.ensureUser(interaction.user.id, interaction.guildId as string);
    const mission = this.ensureDailyMission(interaction.user.id, interaction.guildId as string);

    const catchesReady = mission.progress_catches >= mission.target_catches;
    const trainsReady = mission.progress_trains >= mission.target_trains;
    const ready = catchesReady && trainsReady;

    let claimedNow = false;
    if (ready && mission.claimed === 0) {
      this.db
        .prepare("UPDATE pokemon_daily_missions SET claimed = 1 WHERE user_id = ? AND guild_id = ? AND mission_day = ?")
        .run(interaction.user.id, interaction.guildId, mission.mission_day);

      this.incrementTrainerStats(interaction.user.id, interaction.guildId as string, {
        points: mission.reward_points
      });
      mission.claimed = 1;
      claimedNow = true;
    }

    const status = mission.claimed
      ? "Recompensa reclamada"
      : ready
      ? "Lista para reclamar"
      : "En progreso";

    const embed = new EmbedBuilder()
      .setColor("#8b5cf6")
      .setTitle("Misiones diarias Pokemon")
      .setDescription([
        `Dia: **${mission.mission_day}**`,
        `Estado: **${status}**`,
        "",
        `Capturas: **${mission.progress_catches}/${mission.target_catches}**`,
        `Entrenamientos: **${mission.progress_trains}/${mission.target_trains}**`,
        `Recompensa: **${mission.reward_points} puntos**`
      ].join("\n"))
      .setFooter({ text: claimedNow ? "Recompensa acreditada automaticamente" : "Completala para recibir puntos" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private ensureMetaForPokemon(
    pokemonId: number,
    pokemonName: string,
    rarity: PokemonRarity,
    isStarter: boolean,
    existing?: UserPokemonRow
  ): UserPokemonRow {
    let meta = this.db
      .prepare(
        "SELECT pokemon_id, is_shiny, nature, title, iv_hp, iv_atk, iv_def, iv_spatk, iv_spdef, iv_speed, bond FROM pokemon_meta WHERE pokemon_id = ? LIMIT 1"
      )
      .get(pokemonId) as PokemonMetaRow | undefined;

    if (!meta) {
      const shinyRate = rarity === "legendary" ? 96 : rarity === "rare" ? 140 : 220;
      const isShiny = this.randomInt(1, shinyRate) === 1 ? 1 : 0;
      const nature = NATURES[this.randomInt(0, NATURES.length - 1)] as string;
      const titlePool = TITLES_BY_RARITY[rarity];
      const title = titlePool[this.randomInt(0, titlePool.length - 1)] as string;

      meta = {
        pokemon_id: pokemonId,
        is_shiny: isShiny,
        nature,
        title,
        iv_hp: this.randomInt(0, 31),
        iv_atk: this.randomInt(0, 31),
        iv_def: this.randomInt(0, 31),
        iv_spatk: this.randomInt(0, 31),
        iv_spdef: this.randomInt(0, 31),
        iv_speed: this.randomInt(0, 31),
        bond: isStarter ? 30 : 10
      };

      this.db
        .prepare(
          `INSERT INTO pokemon_meta
           (pokemon_id, is_shiny, nature, title, iv_hp, iv_atk, iv_def, iv_spatk, iv_spdef, iv_speed, bond, captured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
        .run(
          meta.pokemon_id,
          meta.is_shiny,
          meta.nature,
          meta.title,
          meta.iv_hp,
          meta.iv_atk,
          meta.iv_def,
          meta.iv_spatk,
          meta.iv_spdef,
          meta.iv_speed,
          meta.bond
        );
    }

    if (existing) {
      return {
        ...existing,
        is_shiny: meta.is_shiny,
        nature: meta.nature,
        title: meta.title,
        iv_hp: meta.iv_hp,
        iv_atk: meta.iv_atk,
        iv_def: meta.iv_def,
        iv_spatk: meta.iv_spatk,
        iv_spdef: meta.iv_spdef,
        iv_speed: meta.iv_speed,
        bond: meta.bond
      };
    }

    const row = this.db
      .prepare(
        "SELECT id, pokemon_name, rarity, level, xp, nickname FROM pokemon_collection WHERE id = ? LIMIT 1"
      )
      .get(pokemonId) as {
      id: number;
      pokemon_name: string;
      rarity: PokemonRarity;
      level: number;
      xp: number;
      nickname: string | null;
    };

    return {
      ...row,
      is_shiny: meta.is_shiny,
      nature: meta.nature,
      title: meta.title,
      iv_hp: meta.iv_hp,
      iv_atk: meta.iv_atk,
      iv_def: meta.iv_def,
      iv_spatk: meta.iv_spatk,
      iv_spdef: meta.iv_spdef,
      iv_speed: meta.iv_speed,
      bond: meta.bond
    };
  }

  private backfillMissingMeta(userId: string, guildId: string): void {
    const missing = this.db
      .prepare(
        "SELECT p.id, p.pokemon_name, p.rarity, p.is_starter FROM pokemon_collection p LEFT JOIN pokemon_meta m ON m.pokemon_id = p.id WHERE p.user_id = ? AND p.guild_id = ? AND m.pokemon_id IS NULL"
      )
      .all(userId, guildId) as Array<{ id: number; pokemon_name: string; rarity: PokemonRarity; is_starter: number }>;

    for (const row of missing) {
      this.ensureMetaForPokemon(row.id, row.pokemon_name, row.rarity, row.is_starter === 1);
    }
  }

  private incrementTrainerStats(
    userId: string,
    guildId: string,
    changes: {
      catches?: number;
      trains?: number;
      shinyCatches?: number;
      points?: number;
      bestLevel?: number;
      countForStreak?: boolean;
    }
  ): void {
    this.ensureUser(userId, guildId);

    const current = this.getTrainerStats(userId, guildId);
    const catches = current.catches + (changes.catches ?? 0);
    const trains = current.trains + (changes.trains ?? 0);
    const shinyCatches = current.shiny_catches + (changes.shinyCatches ?? 0);
    const points = current.points + (changes.points ?? 0);
    const bestLevel = Math.max(current.best_level, changes.bestLevel ?? 0);

    let streakDays = current.streak_days;
    let lastCatchDay = current.last_catch_day;

    if (changes.countForStreak) {
      const today = this.todayKey();
      if (!lastCatchDay) {
        streakDays = 1;
        lastCatchDay = today;
      } else if (lastCatchDay === today) {
        lastCatchDay = today;
      } else {
        const diff = this.dayDifference(lastCatchDay, today);
        streakDays = diff === 1 ? streakDays + 1 : 1;
        lastCatchDay = today;
      }
    }

    this.db
      .prepare(
        `UPDATE pokemon_trainer_stats
         SET catches = ?, trains = ?, shiny_catches = ?, points = ?, best_level = ?, streak_days = ?, last_catch_day = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(catches, trains, shinyCatches, points, bestLevel, streakDays, lastCatchDay, userId);
  }

  private getTrainerStats(userId: string, guildId: string): TrainerStatsRow {
    this.ensureUser(userId, guildId);
    return this.db
      .prepare(
        "SELECT user_id, guild_id, catches, trains, shiny_catches, points, best_level, streak_days, last_catch_day FROM pokemon_trainer_stats WHERE user_id = ? LIMIT 1"
      )
      .get(userId) as TrainerStatsRow;
  }

  private ensureDailyMission(userId: string, guildId: string): DailyMissionRow {
    const day = this.todayKey();
    let mission = this.db
      .prepare(
        "SELECT user_id, guild_id, mission_day, target_catches, target_trains, progress_catches, progress_trains, reward_points, claimed FROM pokemon_daily_missions WHERE user_id = ? AND guild_id = ? AND mission_day = ? LIMIT 1"
      )
      .get(userId, guildId, day) as DailyMissionRow | undefined;

    if (!mission) {
      const targetCatches = this.randomInt(1, 3);
      const targetTrains = this.randomInt(2, 4);
      const rewardPoints = 25 + targetCatches * 5 + targetTrains * 4;

      this.db
        .prepare(
          `INSERT INTO pokemon_daily_missions
           (user_id, guild_id, mission_day, target_catches, target_trains, progress_catches, progress_trains, reward_points, claimed)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0)`
        )
        .run(userId, guildId, day, targetCatches, targetTrains, rewardPoints);

      mission = {
        user_id: userId,
        guild_id: guildId,
        mission_day: day,
        target_catches: targetCatches,
        target_trains: targetTrains,
        progress_catches: 0,
        progress_trains: 0,
        reward_points: rewardPoints,
        claimed: 0
      };
    }

    return mission;
  }

  private incrementDailyMissionProgress(userId: string, guildId: string, changes: { catches?: number; trains?: number }): void {
    const mission = this.ensureDailyMission(userId, guildId);
    const catches = mission.progress_catches + (changes.catches ?? 0);
    const trains = mission.progress_trains + (changes.trains ?? 0);

    this.db
      .prepare(
        "UPDATE pokemon_daily_missions SET progress_catches = ?, progress_trains = ? WHERE user_id = ? AND guild_id = ? AND mission_day = ?"
      )
      .run(catches, trains, userId, guildId, mission.mission_day);
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
        "SELECT p.id, p.pokemon_name, p.rarity, p.level, p.xp, p.nickname, m.is_shiny, m.nature, m.title, m.iv_hp, m.iv_atk, m.iv_def, m.iv_spatk, m.iv_spdef, m.iv_speed, m.bond FROM pokemon_collection p LEFT JOIN pokemon_meta m ON m.pokemon_id = p.id WHERE p.user_id = ? AND p.guild_id = ? ORDER BY p.level DESC, p.id DESC LIMIT 20"
      )
      .all(userId, guildId) as UserPokemonRow[];
  }

  private progressBar(step: number, total: number): string {
    const done = "■".repeat(Math.max(0, Math.min(step, total)));
    const pending = "□".repeat(Math.max(0, total - step));
    return `[${done}${pending}]`;
  }

  private statBar(value: number, max: number): string {
    const sections = 8;
    const filled = Math.round((Math.max(0, Math.min(value, max)) / max) * sections);
    return `${"▰".repeat(filled)}${"▱".repeat(Math.max(0, sections - filled))} ${value}/${max}`;
  }

  private powerScore(row: Pick<UserPokemonRow, "level" | "iv_hp" | "iv_atk" | "iv_def" | "iv_spatk" | "iv_spdef" | "iv_speed" | "bond" | "is_shiny">): number {
    const ivTotal = (row.iv_hp ?? 0) + (row.iv_atk ?? 0) + (row.iv_def ?? 0) + (row.iv_spatk ?? 0) + (row.iv_spdef ?? 0) + (row.iv_speed ?? 0);
    const levelPart = row.level * 6;
    const bondPart = Math.floor((row.bond ?? 0) / 2);
    const shinyPart = row.is_shiny ? 25 : 0;
    return ivTotal + levelPart + bondPart + shinyPart;
  }

  private pokemonTier(row: UserPokemonRow): string {
    const power = this.powerScore(row);
    if (power >= 260) {
      return "S";
    }
    if (power >= 220) {
      return "A";
    }
    if (power >= 180) {
      return "B";
    }
    if (power >= 140) {
      return "C";
    }
    return "D";
  }

  private trainerRank(points: number): string {
    if (points >= 1500) {
      return "Master";
    }
    if (points >= 900) {
      return "Elite";
    }
    if (points >= 450) {
      return "Veterano";
    }
    if (points >= 180) {
      return "Aventurero";
    }
    return "Novato";
  }

  private pointsByRarity(rarity: PokemonRarity): number {
    const points: Record<PokemonRarity, number> = {
      common: 6,
      uncommon: 10,
      rare: 16,
      legendary: 28
    };
    return points[rarity];
  }

  private dayDifference(from: string, to: string): number {
    const fromDate = new Date(`${from}T00:00:00Z`).getTime();
    const toDate = new Date(`${to}T00:00:00Z`).getTime();
    return Math.round((toDate - fromDate) / 86_400_000);
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
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
