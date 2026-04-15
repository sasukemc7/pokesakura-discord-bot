import {
  ChannelType,
  EmbedBuilder,
  GuildMember,
  TextChannel
} from "discord.js";
import type { BotConfig } from "../config/types";
import { logger } from "../core/logger";
import { renderWelcomeImage } from "../utils/canvas";
import { applyTemplate } from "../utils/templates";

export class WelcomeService {
  public constructor(private readonly config: BotConfig) {}

  public async onMemberJoin(member: GuildMember): Promise<void> {
    if (!this.config.welcome.enabled) {
      return;
    }

    const channel = member.guild.channels.cache.get(this.config.welcome.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn("Canal de bienvenida no encontrado o invalido", {
        guildId: member.guild.id,
        channelId: this.config.welcome.channelId
      });
      return;
    }

    const textChannel = channel as TextChannel;
    const message = applyTemplate(this.config.welcome.messageTemplate, {
      userMention: `<@${member.id}>`,
      username: member.user.username,
      serverName: member.guild.name,
      memberCount: member.guild.memberCount
    });

    const embed = new EmbedBuilder()
      .setColor(this.config.welcome.embed.color as `#${string}`)
      .setTitle(this.config.welcome.embed.title)
      .setDescription(`${this.config.welcome.embed.description}\n\n${message}`)
      .setFooter({ text: this.config.welcome.embed.footer })
      .setTimestamp();

    if (this.config.welcome.embed.showThumbnail) {
      embed.setThumbnail(member.user.displayAvatarURL({ extension: "png", size: 256 }));
    }

    const shouldImage =
      this.config.welcome.image.enabled &&
      (this.config.welcome.mode === "image" || this.config.welcome.mode === "both");
    const shouldEmbed = this.config.welcome.mode === "embed" || this.config.welcome.mode === "both";

    const files = [];
    if (shouldImage) {
      const welcomeImage = await renderWelcomeImage({
        width: this.config.welcome.image.width,
        height: this.config.welcome.image.height,
        colorA: this.config.welcome.image.background.colorA,
        colorB: this.config.welcome.image.background.type === "gradient"
          ? this.config.welcome.image.background.colorB
          : this.config.welcome.image.background.colorA,
        title: this.config.welcome.image.title,
        subtitle: this.config.welcome.image.subtitle,
        username: member.user.username,
        memberCountText: `Miembro #${member.guild.memberCount}`,
        avatarUrl: member.user.displayAvatarURL({ extension: "png", size: 512 })
      });
      files.push(welcomeImage);
    }

    await textChannel.send({
      content: shouldEmbed ? undefined : message,
      embeds: shouldEmbed ? [embed] : [],
      files
    });
  }
}
