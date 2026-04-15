import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  GuildMember,
  MessageFlags,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  userMention
} from "discord.js";
import type Database from "better-sqlite3";
import type { BotConfig } from "../config/types";
import { BotDatabase } from "../db/database";
import { logger } from "../core/logger";
import { renderTicketPanelImage } from "../utils/canvas";
import { sha256 } from "../utils/hash";
import { applyTemplate } from "../utils/templates";
import { evaluateOfficeHours } from "../utils/time";

interface TicketRow {
  id: number;
  guild_id: string;
  channel_id: string;
  owner_id: string;
  owner_name: string;
  subject: string;
  priority: string;
  status: string;
  claimed_by: string | null;
  created_at: string;
  closed_at: string | null;
  close_reason: string | null;
  form_payload: string;
}

export class TicketService {
  private readonly db: Database.Database;

  public constructor(
    private readonly config: BotConfig,
    database: BotDatabase
  ) {
    this.db = database.raw();
  }

  public async syncPanel(guild: Guild): Promise<void> {
    if (!this.config.tickets.enabled) {
      return;
    }

    const channel = guild.channels.cache.get(this.config.tickets.panelChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn("Panel de tickets: canal invalido", {
        guildId: guild.id,
        channelId: this.config.tickets.panelChannelId
      });
      return;
    }

    const panelChannel = channel as TextChannel;

    const panelEmbed = new EmbedBuilder()
      .setColor(this.config.tickets.panel.color as `#${string}`)
      .setTitle(this.config.tickets.panel.title)
      .setDescription(this.config.tickets.panel.description)
      .setFooter({ text: "Sistema de tickets persistente" })
      .setTimestamp();

    const createButton = new ButtonBuilder()
      .setCustomId("ticket:create")
      .setLabel(this.config.tickets.panel.buttonLabel)
      .setStyle(ButtonStyle.Primary)
      .setEmoji(this.config.tickets.panel.buttonEmoji);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(createButton);

    const panelPayload = {
      embed: panelEmbed.toJSON(),
      components: row.toJSON(),
      image: this.config.tickets.panel.image
    };
    const payloadHash = sha256(JSON.stringify(panelPayload));

    const storedPanel = this.db
      .prepare("SELECT message_id, payload_hash FROM ticket_panels WHERE guild_id = ?")
      .get(guild.id) as { message_id: string; payload_hash: string } | undefined;

    const files = [];
    if (this.config.tickets.panel.image.enabled) {
      const panelImage = await renderTicketPanelImage({
        width: this.config.tickets.panel.image.width,
        height: this.config.tickets.panel.image.height,
        colorA: this.config.tickets.panel.image.colorA,
        colorB: this.config.tickets.panel.image.colorB,
        title: this.config.tickets.panel.image.title,
        subtitle: this.config.tickets.panel.image.subtitle,
        guildName: guild.name
      });
      files.push(panelImage);
      panelEmbed.setImage("attachment://tickets-panel.png");
    }

    if (storedPanel) {
      try {
        const existingMessage = await panelChannel.messages.fetch(storedPanel.message_id);
        if (storedPanel.payload_hash !== payloadHash) {
          await existingMessage.edit({ embeds: [panelEmbed], components: [row], files });
          this.db
            .prepare(
              "UPDATE ticket_panels SET payload_hash = ?, updated_at = datetime('now') WHERE guild_id = ?"
            )
            .run(payloadHash, guild.id);
        }
        return;
      } catch {
        logger.warn("No se encontro el panel guardado, se recreara", { guildId: guild.id });
      }
    }

    const sent = await panelChannel.send({ embeds: [panelEmbed], components: [row], files });

    this.db
      .prepare(
        `INSERT INTO ticket_panels (guild_id, channel_id, message_id, payload_hash, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(guild_id) DO UPDATE SET
           channel_id = excluded.channel_id,
           message_id = excluded.message_id,
           payload_hash = excluded.payload_hash,
           updated_at = excluded.updated_at`
      )
      .run(guild.id, panelChannel.id, sent.id, payloadHash);
  }

  public async onCreateTicketButton(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("ticket:modal-open")
      .setTitle(this.config.tickets.forms.title);

    const rows: Array<ActionRowBuilder<TextInputBuilder>> = [];
    for (const field of this.config.tickets.forms.fields.slice(0, 5)) {
      const input = new TextInputBuilder()
        .setCustomId(`field:${field.key}`)
        .setLabel(field.label)
        .setStyle(field.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(field.required)
        .setPlaceholder(field.placeholder)
        .setMinLength(field.minLength)
        .setMaxLength(field.maxLength);

      rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }

    modal.addComponents(...rows);
    await interaction.showModal(modal);
  }

  public async onTicketModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      return;
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const openTickets = this.db
      .prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND owner_id = ? AND status = 'open'")
      .get(interaction.guildId, interaction.user.id) as { count: number };

    if (openTickets.count >= this.config.tickets.limits.maxOpenPerUser) {
      await interaction.editReply({ content: this.config.tickets.messages.noMoreTickets });
      return;
    }

    const formValues: Record<string, string> = {};
    for (const field of this.config.tickets.forms.fields) {
      formValues[field.key] = interaction.fields.getTextInputValue(`field:${field.key}`);
    }

    const subject = formValues.asunto || formValues.subject || "Sin asunto";

    const channel = await this.createTicketChannel(interaction.member, this.config.tickets.priorities.default);

    const insert = this.db.prepare(
      `INSERT INTO tickets (
        guild_id, channel_id, owner_id, owner_name, subject, priority, status, claimed_by,
        created_at, closed_at, close_reason, form_payload
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, datetime('now'), NULL, NULL, ?)`
    );

    const info = insert.run(
      interaction.guildId,
      channel.id,
      interaction.user.id,
      interaction.user.tag,
      subject,
      this.config.tickets.priorities.default,
      JSON.stringify(formValues)
    );

    const ticketId = Number(info.lastInsertRowid);

    await this.sendTicketIntro(channel, ticketId, interaction.user.id, formValues);

    const office = evaluateOfficeHours(this.config.tickets.officeHours);
    if (!office.inHours) {
      const notice = applyTemplate(this.config.tickets.messages.outsideHoursNotice, {
        currentTime: office.currentTime,
        nextOpening: office.nextOpening
      });
      await channel.send({ content: `⚠️ ${notice}` });
    }

    await interaction.editReply({ content: `✅ Ticket creado: ${channel}` });
  }

  private async createTicketChannel(
    member: GuildMember,
    priority: string
  ): Promise<TextChannel> {
    const categoryId = this.config.tickets.categoryId;
    const usernameBase = member.user.username
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "usuario";

    const ticketCount = this.db
      .prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND owner_id = ?")
      .get(member.guild.id, member.id) as { count: number };
    const nextTicketNumber = ticketCount.count + 1;

    const channelName = `${this.config.tickets.naming.prefix}-${usernameBase}-${nextTicketNumber}`;

    const permissionOverwrites = [
      {
        id: member.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: member.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
      }
    ];

    const roles = this.getStaffRoleIds(member.guild.id);
    for (const roleId of roles) {
      if (!member.guild.roles.cache.has(roleId)) {
        logger.warn("Se omite rol staff invalido o inexistente para permisos de ticket", {
          guildId: member.guild.id,
          roleId
        });
        continue;
      }

      permissionOverwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      });
    }

    const channel = await member.guild.channels.create({
      name: channelName,
      parent: categoryId,
      type: ChannelType.GuildText,
      permissionOverwrites
    });

    await this.bumpChannel(channel, priority);

    return channel;
  }

  private async sendTicketIntro(
    channel: TextChannel,
    ticketId: number,
    ownerId: string,
    fields: Record<string, string>
  ): Promise<void> {
    const fieldBlocks = Object.entries(fields)
      .map(([key, value]) => `**${key}:**\n${value}`)
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(this.config.tickets.panel.color as `#${string}`)
      .setTitle(`${this.config.tickets.messages.createdTitle} #${ticketId}`)
      .setDescription(`${this.config.tickets.messages.createdDescription}\n\n${fieldBlocks}`)
      .setTimestamp();

    const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("ticket:claim").setLabel("Asignarme").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ticket:close").setLabel("Cerrar").setStyle(ButtonStyle.Danger)
    );

    const priorityOptions = Object.entries(this.config.tickets.priorities.levels).map(([key, val]) => ({
      label: val.label,
      value: key,
      emoji: val.emoji,
      default: key === this.config.tickets.priorities.default
    }));

    const priorityRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ticket:priority")
        .setPlaceholder("Cambiar prioridad")
        .addOptions(priorityOptions)
    );

    const mentionText = this.config.tickets.roles.mentionOnCreate
      ? this.getStaffRoleIds(channel.guild.id).map((roleId) => `<@&${roleId}>`).join(" ")
      : "";

    await channel.send({
      content: `${mentionText} Ticket abierto por ${userMention(ownerId)}`.trim(),
      embeds: [embed],
      components: [actions, priorityRow]
    });
  }

  public getTicketByChannel(channelId: string): TicketRow | undefined {
    return this.db
      .prepare("SELECT * FROM tickets WHERE channel_id = ? LIMIT 1")
      .get(channelId) as TicketRow | undefined;
  }

  public onTicketMessage(message: Message): void {
    if (!message.inGuild() || message.author.bot) {
      return;
    }

    const ticket = this.getTicketByChannel(message.channelId);
    if (!ticket || ticket.status !== "open") {
      return;
    }

    this.db
      .prepare(
        "INSERT INTO ticket_messages (ticket_id, user_id, user_name, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      )
      .run(ticket.id, message.author.id, message.author.tag, message.content.slice(0, 1900));
  }

  public async onTicketControlButton(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      return;
    }

    const ticket = this.getTicketByChannel(interaction.channelId);
    if (!ticket) {
      await interaction.reply({ content: "Este canal no es un ticket registrado.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!this.canManageTicket(interaction.member, interaction.guildId)) {
      await interaction.reply({ content: "No tienes permisos para gestionar tickets.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.customId === "ticket:claim") {
      this.db
        .prepare("UPDATE tickets SET claimed_by = ? WHERE id = ?")
        .run(interaction.user.id, ticket.id);
      await interaction.reply({ content: `✅ Ticket asignado a ${interaction.user}.` });
      return;
    }

    if (interaction.customId === "ticket:close") {
      this.db
        .prepare("UPDATE tickets SET status = 'closed', closed_at = datetime('now'), close_reason = ? WHERE id = ?")
        .run("closed_by_staff", ticket.id);

      const transcriptChannel = interaction.guild.channels.cache.get(this.config.tickets.transcripts.channelId);
      if (!transcriptChannel || transcriptChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: "No se pudo enviar la transcripcion: el canal de transcripciones no es valido.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const transcript = await this.generateTranscript(ticket, interaction.guild);
      await transcriptChannel.send({
        content: `Transcripcion del ticket #${ticket.id} | Canal: ${ticket.channel_id} | Creador: <@${ticket.owner_id}>`,
        files: [{ attachment: Buffer.from(transcript, "utf8"), name: `ticket-${ticket.id}.txt` }]
      });

      await interaction.reply({
        content: "Transcripcion enviada y ticket cerrado correctamente.",
        flags: MessageFlags.Ephemeral
      });

      if (interaction.channel && interaction.channel.isTextBased()) {
        await interaction.channel.delete("Ticket cerrado con transcripcion enviada");
      }
      return;
    }
  }

  public async onPrioritySelect(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      return;
    }

    const ticket = this.getTicketByChannel(interaction.channelId);
    if (!ticket) {
      await interaction.reply({ content: "Este canal no es un ticket registrado.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!this.canManageTicket(interaction.member, interaction.guildId)) {
      await interaction.reply({ content: "No tienes permisos para cambiar prioridad.", flags: MessageFlags.Ephemeral });
      return;
    }

    const priority = interaction.values[0] ?? this.config.tickets.priorities.default;
    this.db.prepare("UPDATE tickets SET priority = ? WHERE id = ?").run(priority, ticket.id);

    if (interaction.channel && interaction.channel.type === ChannelType.GuildText) {
      await this.bumpChannel(interaction.channel, priority);
    }

    await interaction.reply({ content: `✅ Prioridad cambiada a **${priority}**.` });
  }

  private async bumpChannel(channel: TextChannel, priority: string): Promise<void> {
    const scoreByPriority: Record<string, number> = {
      urgent: 0,
      high: 1,
      medium: 2,
      low: 3
    };

    const position = scoreByPriority[priority] ?? 3;
    await channel.setPosition(position);
  }

  private async generateTranscript(ticket: TicketRow, guild: Guild): Promise<string> {
    const rows = this.db
      .prepare(
        "SELECT user_id, user_name, content, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY id ASC"
      )
      .all(ticket.id) as Array<{ user_id: string; user_name: string; content: string; created_at: string }>;

    if (!rows.length) {
      return "No hubo mensajes en este ticket.";
    }

    const staffRoles = new Set(this.getStaffRoleIds(guild.id));
    const memberCache = new Map<string, GuildMember | null>();

    const resolveActorType = async (userId: string): Promise<"STAFF" | "USUARIO"> => {
      if (userId === ticket.owner_id) {
        return "USUARIO";
      }

      if (memberCache.has(userId)) {
        const cached = memberCache.get(userId);
        if (!cached) {
          return "USUARIO";
        }
        const isStaffCached = cached.permissions.has(PermissionFlagsBits.Administrator)
          || cached.roles.cache.some((role) => staffRoles.has(role.id));
        return isStaffCached ? "STAFF" : "USUARIO";
      }

      const member = guild.members.cache.get(userId)
        ?? await guild.members.fetch(userId).catch(() => null);
      memberCache.set(userId, member);

      if (!member) {
        return "USUARIO";
      }

      const isStaff = member.permissions.has(PermissionFlagsBits.Administrator)
        || member.roles.cache.some((role) => staffRoles.has(role.id));

      return isStaff ? "STAFF" : "USUARIO";
    };

    const lines: string[] = [];
    for (const row of rows) {
      const actorType = await resolveActorType(row.user_id);
      const cleanContent = row.content.replace(/\r?\n/g, " ").trim() || "[sin contenido]";
      lines.push(`${actorType} ${row.user_name}: ${cleanContent}`);
    }

    return lines.join("\n");
  }

  private canManageTicket(member: GuildMember, guildId: string): boolean {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }

    const roles = this.getStaffRoleIds(guildId);
    return roles.some((roleId) => member.roles.cache.has(roleId));
  }

  private getStaffRoleIds(guildId: string): string[] {
    const dbRoles = this.db
      .prepare("SELECT role_id FROM ticket_staff_roles WHERE guild_id = ?")
      .all(guildId) as Array<{ role_id: string }>;

    if (dbRoles.length > 0) {
      return dbRoles.map((row) => row.role_id);
    }

    return this.config.tickets.roles.staffRoleIds;
  }

  public async handleStaffCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Este comando solo funciona en servidores.", flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const role = interaction.options.getRole("rol", true);

    if (sub === "add") {
      this.db
        .prepare(
          "INSERT INTO ticket_staff_roles (guild_id, role_id) VALUES (?, ?) ON CONFLICT(guild_id, role_id) DO NOTHING"
        )
        .run(interaction.guildId, role.id);
      await interaction.reply({ content: `✅ Rol ${role} agregado como staff de tickets.` });
      return;
    }

    if (sub === "remove") {
      this.db
        .prepare("DELETE FROM ticket_staff_roles WHERE guild_id = ? AND role_id = ?")
        .run(interaction.guildId, role.id);
      await interaction.reply({ content: `✅ Rol ${role} removido de staff de tickets.` });
      return;
    }

    await interaction.reply({ content: "Subcomando no soportado.", flags: MessageFlags.Ephemeral });
  }

  public async handleTicketAdmin(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: "Comando solo disponible en servidor.", flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const ticket = this.getTicketByChannel(interaction.channelId);

    if (!ticket) {
      await interaction.reply({ content: "Este canal no es un ticket.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!this.canManageTicket(interaction.member, interaction.guildId)) {
      await interaction.reply({ content: "No tienes permisos para este comando.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "rename") {
      const nombre = interaction.options.getString("nombre", true).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (interaction.channel && interaction.channel.type === ChannelType.GuildText) {
        await interaction.channel.setName(nombre.slice(0, 90));
      }
      await interaction.reply({ content: `✅ Ticket renombrado a ${nombre}` });
      return;
    }

    if (sub === "priority") {
      const value = interaction.options.getString("nivel", true);
      this.db.prepare("UPDATE tickets SET priority = ? WHERE id = ?").run(value, ticket.id);
      if (interaction.channel && interaction.channel.type === ChannelType.GuildText) {
        await this.bumpChannel(interaction.channel, value);
      }
      await interaction.reply({ content: `✅ Prioridad actualizada a ${value}.` });
      return;
    }

    await interaction.reply({ content: "Subcomando no soportado.", flags: MessageFlags.Ephemeral });
  }
}
