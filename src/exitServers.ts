import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("Falta DISCORD_TOKEN en .env");
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.once("clientReady", async () => {
    console.log(`Conectado como ${client.user?.tag ?? "desconocido"}`);
    console.log(`Saliendo de ${client.guilds.cache.size} servidor(es)...`);

    for (const guild of client.guilds.cache.values()) {
      try {
        await guild.leave();
        console.log(`OK -> ${guild.name} (${guild.id})`);
      } catch (error) {
        console.error(`ERROR -> ${guild.name} (${guild.id})`, error);
      }
    }

    console.log("Proceso completado. Cerrando sesion...");
    client.destroy();
    process.exit(0);
  });

  client.on("error", (error) => {
    console.error("Error del cliente de Discord", error);
  });

  await client.login(token);
}

void main().catch((error) => {
  console.error("Fallo al ejecutar salida de servidores", error);
  process.exit(1);
});
