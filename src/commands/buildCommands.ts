import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord-api-types/v10";
import { SlashCommandBuilder } from "discord.js";
import type { BotConfig } from "../config/types";

export function buildCommands(config: BotConfig): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  const ticket = new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Gestion de ticket actual")
    .addSubcommand((sub) =>
      sub
        .setName("rename")
        .setDescription("Renombra el ticket actual")
        .addStringOption((opt) => opt.setName("nombre").setDescription("Nuevo nombre").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("priority")
        .setDescription("Cambia la prioridad del ticket")
        .addStringOption((opt) => {
          let option = opt.setName("nivel").setDescription("Nuevo nivel de prioridad").setRequired(true);
          for (const [key, value] of Object.entries(config.tickets.priorities.levels)) {
            option = option.addChoices({ name: `${value.emoji} ${value.label}`, value: key });
          }
          return option;
        })
    );

  const staff = new SlashCommandBuilder()
    .setName("staff")
    .setDescription("Gestiona roles staff del sistema de tickets")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Agrega un rol como staff")
        .addRoleOption((opt) => opt.setName("rol").setDescription("Rol a agregar").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remueve un rol de staff")
        .addRoleOption((opt) => opt.setName("rol").setDescription("Rol a remover").setRequired(true))
    );

  const pokemon = new SlashCommandBuilder()
    .setName("pokemon")
    .setDescription("Sistema de mascotas Pokemon")
    .addSubcommand((sub) =>
      sub
        .setName("starter")
        .setDescription("Elige tu Pokemon inicial")
        .addStringOption((opt) => {
          let option = opt.setName("pokemon").setDescription("Inicial").setRequired(true);
          for (const starter of config.pokemon.starters) {
            option = option.addChoices({ name: starter, value: starter });
          }
          return option;
        })
    )
    .addSubcommand((sub) => sub.setName("catch").setDescription("Intenta capturar un Pokemon"))
    .addSubcommand((sub) => sub.setName("party").setDescription("Muestra tu coleccion"))
    .addSubcommand((sub) =>
      sub
        .setName("active")
        .setDescription("Define Pokemon activo")
        .addIntegerOption((opt) => opt.setName("id").setDescription("ID del Pokemon").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("train").setDescription("Entrena tu Pokemon activo"))
    .addSubcommand((sub) => sub.setName("profile").setDescription("Estadisticas de tu entrenador"));

  return [ticket.toJSON(), staff.toJSON(), pokemon.toJSON()];
}
