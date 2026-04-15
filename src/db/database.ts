import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export class BotDatabase {
  private readonly db: Database.Database;

  public constructor(filePath = path.resolve(process.cwd(), "data", "bot.sqlite")) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bot_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ticket_panels (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL UNIQUE,
        owner_id TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        subject TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        claimed_by TEXT,
        created_at TEXT NOT NULL,
        closed_at TEXT,
        close_reason TEXT,
        form_payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ticket_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(ticket_id) REFERENCES tickets(id)
      );

      CREATE TABLE IF NOT EXISTS ticket_staff_roles (
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        PRIMARY KEY(guild_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS pokemon_users (
        user_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        active_pokemon_id INTEGER,
        last_catch_at TEXT,
        last_train_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pokemon_collection (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        pokemon_name TEXT NOT NULL,
        rarity TEXT NOT NULL,
        level INTEGER NOT NULL,
        xp INTEGER NOT NULL,
        is_starter INTEGER NOT NULL DEFAULT 0,
        nickname TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pokemon_meta (
        pokemon_id INTEGER PRIMARY KEY,
        is_shiny INTEGER NOT NULL DEFAULT 0,
        nature TEXT NOT NULL,
        title TEXT NOT NULL,
        iv_hp INTEGER NOT NULL,
        iv_atk INTEGER NOT NULL,
        iv_def INTEGER NOT NULL,
        iv_spatk INTEGER NOT NULL,
        iv_spdef INTEGER NOT NULL,
        iv_speed INTEGER NOT NULL,
        bond INTEGER NOT NULL DEFAULT 0,
        captured_at TEXT NOT NULL,
        FOREIGN KEY(pokemon_id) REFERENCES pokemon_collection(id)
      );

      CREATE TABLE IF NOT EXISTS pokemon_trainer_stats (
        user_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        catches INTEGER NOT NULL DEFAULT 0,
        trains INTEGER NOT NULL DEFAULT 0,
        shiny_catches INTEGER NOT NULL DEFAULT 0,
        points INTEGER NOT NULL DEFAULT 0,
        best_level INTEGER NOT NULL DEFAULT 0,
        streak_days INTEGER NOT NULL DEFAULT 0,
        last_catch_day TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pokemon_daily_missions (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        mission_day TEXT NOT NULL,
        target_catches INTEGER NOT NULL,
        target_trains INTEGER NOT NULL,
        progress_catches INTEGER NOT NULL DEFAULT 0,
        progress_trains INTEGER NOT NULL DEFAULT 0,
        reward_points INTEGER NOT NULL,
        claimed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(user_id, guild_id, mission_day)
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_guild_owner_status ON tickets(guild_id, owner_id, status);
      CREATE INDEX IF NOT EXISTS idx_tickets_status_priority ON tickets(status, priority);
      CREATE INDEX IF NOT EXISTS idx_pokemon_user ON pokemon_collection(user_id, guild_id);
      CREATE INDEX IF NOT EXISTS idx_pokemon_meta_shiny ON pokemon_meta(is_shiny);
      CREATE INDEX IF NOT EXISTS idx_pokemon_trainer_points ON pokemon_trainer_stats(guild_id, points DESC);
    `);
  }

  public raw(): Database.Database {
    return this.db;
  }
}
