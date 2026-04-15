import { AttachmentBuilder } from "discord.js";
import { CanvasRenderingContext2D, createCanvas, loadImage } from "canvas";

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface WelcomeImageInput {
  width: number;
  height: number;
  colorA: string;
  colorB: string;
  title: string;
  subtitle: string;
  username: string;
  memberCountText: string;
  avatarUrl: string;
}

export async function renderWelcomeImage(input: WelcomeImageInput): Promise<AttachmentBuilder> {
  const canvas = createCanvas(input.width, input.height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, input.width, input.height);
  gradient.addColorStop(0, input.colorA);
  gradient.addColorStop(1, input.colorB);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, input.width, input.height);

  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 14; i += 1) {
    ctx.beginPath();
    ctx.arc(90 + i * 90, 40 + (i % 3) * 85, 42, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  roundedRect(ctx, 50, 40, input.width - 100, input.height - 80, 28);
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fill();

  const avatarSize = Math.min(190, input.height - 120);
  const avatarX = 90;
  const avatarY = (input.height - avatarSize) / 2;

  const avatar = await loadImage(input.avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2);
  ctx.stroke();

  const textX = avatarX + avatarSize + 60;
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 46px Sans";
  ctx.fillText(input.title, textX, 130);

  ctx.font = "600 34px Sans";
  ctx.fillText(input.subtitle.replace("{username}", input.username), textX, 180);

  ctx.font = "500 28px Sans";
  ctx.fillStyle = "#d1fae5";
  ctx.fillText(input.memberCountText, textX, 230);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "welcome.png" });
}

export interface TicketPanelImageInput {
  width: number;
  height: number;
  colorA: string;
  colorB: string;
  title: string;
  subtitle: string;
  guildName: string;
}

export async function renderTicketPanelImage(input: TicketPanelImageInput): Promise<AttachmentBuilder> {
  const canvas = createCanvas(input.width, input.height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, input.width, input.height);
  gradient.addColorStop(0, input.colorA);
  gradient.addColorStop(1, input.colorB);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, input.width, input.height);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 20; i += 1) {
    roundedRect(ctx, 20 + i * 56, 30 + ((i % 5) * 60), 44, 24, 8);
    ctx.fill();
  }

  roundedRect(ctx, 56, 60, input.width - 112, input.height - 120, 26);
  ctx.fillStyle = "rgba(8, 12, 23, 0.52)";
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 58px Sans";
  ctx.fillText(input.title, 96, 170);

  ctx.font = "500 34px Sans";
  ctx.fillStyle = "#bae6fd";
  ctx.fillText(input.subtitle, 96, 225);

  ctx.font = "600 30px Sans";
  ctx.fillStyle = "#dbeafe";
  ctx.fillText(`Servidor: ${input.guildName}`, 96, 285);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "tickets-panel.png" });
}
