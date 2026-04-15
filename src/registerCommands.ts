import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadConfig } from "./config/loadConfig";
import { buildCommands } from "./commands/buildCommands";

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    throw new Error("Faltan DISCORD_TOKEN y/o DISCORD_CLIENT_ID en .env");
  }

  const config = loadConfig();
  const commands = buildCommands(config);

  const rest = new REST({ version: "10" }).setToken(token);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`Comandos registrados en guild ${guildId}`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log("Comandos globales registrados");
}

void main();
