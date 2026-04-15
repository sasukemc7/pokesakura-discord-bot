import "dotenv/config";
import {
  ActivityType,
  ButtonInteraction,
  Client,
  DiscordAPIError,
  GatewayIntentBits,
  Interaction,
  MessageFlags,
  ModalSubmitInteraction,
  Partials,
  StringSelectMenuInteraction
} from "discord.js";
import { loadConfig } from "./config/loadConfig";
import { logger } from "./core/logger";
import { BotDatabase } from "./db/database";
import { PokemonService } from "./services/pokemonService";
import { TicketService } from "./services/ticketService";
import { WelcomeService } from "./services/welcomeService";

const config = loadConfig();
const database = new BotDatabase();

const welcomeService = new WelcomeService(config);
const ticketService = new TicketService(config, database);
const pokemonService = new PokemonService(config, database);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

function resolveActivityType(value: string): ActivityType {
  const map: Record<string, ActivityType> = {
    Playing: ActivityType.Playing,
    Streaming: ActivityType.Streaming,
    Listening: ActivityType.Listening,
    Watching: ActivityType.Watching,
    Competing: ActivityType.Competing
  };

  return map[value] ?? ActivityType.Watching;
}

client.once("clientReady", async () => {
  if (!client.user) {
    return;
  }

  client.user.setPresence({
    status: config.bot.presence.status,
    activities: [
      {
        type: resolveActivityType(config.bot.presence.activityType),
        name: config.bot.presence.activityText
      }
    ]
  });

  logger.info(`Bot conectado como ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await ticketService.syncPanel(guild);
  }
});

client.on("guildMemberAdd", async (member) => {
  try {
    await welcomeService.onMemberJoin(member);
  } catch (error) {
    logger.error("Error en sistema de bienvenida", error);
  }
});

client.on("messageCreate", (message) => {
  ticketService.onTicketMessage(message);
});

client.on("interactionCreate", async (interaction: Interaction) => {
  try {
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
      return;
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "staff") {
        await ticketService.handleStaffCommand(interaction);
        return;
      }

      if (interaction.commandName === "ticket") {
        await ticketService.handleTicketAdmin(interaction);
        return;
      }

      if (interaction.commandName === "pokemon") {
        await pokemonService.handleCommand(interaction);
        return;
      }
    }
  } catch (error) {
    logger.error("Error en interactionCreate", error);
    if (error instanceof DiscordAPIError && error.code === 10062) {
      logger.warn("Interaccion expirada antes de responder (10062)");
      return;
    }

    if (interaction.isRepliable()) {
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: "Ocurrio un error al procesar la accion." });
        } else if (!interaction.replied) {
          await interaction.reply({ content: "Ocurrio un error al procesar la accion.", flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        logger.warn("No se pudo responder la interaccion de error", replyError);
      }
    }
  }
});

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId === "ticket:create") {
    await ticketService.onCreateTicketButton(interaction);
    return;
  }

  if (interaction.customId.startsWith("ticket:")) {
    await ticketService.onTicketControlButton(interaction);
  }
}

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId === "ticket:modal-open") {
    await ticketService.onTicketModalSubmit(interaction);
  }
}

async function handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (interaction.customId === "ticket:priority") {
    await ticketService.onPrioritySelect(interaction);
    return;
  }

  const handledByPokemon = await pokemonService.onSelectMenu(interaction);
  if (handledByPokemon) {
    return;
  }
}

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("Falta DISCORD_TOKEN en .env");
}

void client.login(token);
