import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { BotConfig } from "./types";

const formFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  style: z.enum(["short", "paragraph"]),
  required: z.boolean(),
  placeholder: z.string(),
  minLength: z.number().int().min(0),
  maxLength: z.number().int().min(1)
});

const configSchema = z.object({
  bot: z.object({
    presence: z.object({
      status: z.enum(["online", "idle", "dnd", "invisible"]),
      activityType: z.enum(["Playing", "Streaming", "Listening", "Watching", "Competing"]),
      activityText: z.string().min(1)
    })
  }),
  welcome: z.object({
    enabled: z.boolean(),
    channelId: z.string(),
    mode: z.enum(["embed", "image", "both"]),
    messageTemplate: z.string(),
    embed: z.object({
      color: z.string(),
      title: z.string(),
      description: z.string(),
      footer: z.string(),
      showThumbnail: z.boolean()
    }),
    image: z.object({
      enabled: z.boolean(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      background: z.object({
        type: z.enum(["gradient", "color"]),
        colorA: z.string(),
        colorB: z.string()
      }),
      title: z.string(),
      subtitle: z.string(),
      accentColor: z.string(),
      showMemberCount: z.boolean()
    })
  }),
  tickets: z.object({
    enabled: z.boolean(),
    categoryId: z.string(),
    panelChannelId: z.string(),
    transcripts: z.object({
      channelId: z.string()
    }),
    panel: z.object({
      title: z.string(),
      description: z.string(),
      color: z.string(),
      buttonLabel: z.string(),
      buttonEmoji: z.string(),
      image: z.object({
        enabled: z.boolean(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        colorA: z.string(),
        colorB: z.string(),
        title: z.string(),
        subtitle: z.string()
      })
    }),
    naming: z.object({
      prefix: z.string().min(1)
    }),
    limits: z.object({
      maxOpenPerUser: z.number().int().min(1)
    }),
    priorities: z.object({
      default: z.string(),
      levels: z.record(
        z.string(),
        z.object({
          label: z.string(),
          emoji: z.string()
        })
      )
    }),
    roles: z.object({
      staffRoleIds: z.array(z.string()).default([]),
      mentionOnCreate: z.boolean()
    }),
    messages: z.object({
      createdTitle: z.string(),
      createdDescription: z.string(),
      outsideHoursNotice: z.string(),
      noMoreTickets: z.string()
    }),
    forms: z.object({
      title: z.string(),
      fields: z.array(formFieldSchema).min(1)
    }),
    officeHours: z.object({
      timezone: z.string(),
      monday: z.string(),
      tuesday: z.string(),
      wednesday: z.string(),
      thursday: z.string(),
      friday: z.string(),
      saturday: z.string(),
      sunday: z.string()
    })
  }),
  pokemon: z.object({
    enabled: z.boolean(),
    starters: z.array(z.string()).min(1),
    rarityWeights: z.object({
      common: z.number().int().min(0),
      uncommon: z.number().int().min(0),
      rare: z.number().int().min(0),
      legendary: z.number().int().min(0)
    }),
    xp: z.object({
      trainMin: z.number().int().min(1),
      trainMax: z.number().int().min(1),
      levelCurveBase: z.number().int().min(10)
    }),
    economy: z.object({
      catchCooldownMinutes: z.number().int().min(1),
      trainCooldownMinutes: z.number().int().min(1)
    }),
    messages: z.object({
      catchSuccess: z.string(),
      noStarter: z.string()
    })
  })
});

export function loadConfig(configPath = path.resolve(process.cwd(), "config.yml")): BotConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`No existe config.yml en ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = parse(raw);
  const validated = configSchema.parse(parsed);

  for (const field of validated.tickets.forms.fields) {
    if (field.minLength > field.maxLength) {
      throw new Error(`El campo de formulario '${field.key}' tiene minLength mayor que maxLength`);
    }
  }

  return validated;
}
