export type WelcomeMode = "embed" | "image" | "both";

export type FormFieldStyle = "short" | "paragraph";

export interface BotConfig {
  bot: {
    presence: {
      status: "online" | "idle" | "dnd" | "invisible";
      activityType: "Playing" | "Streaming" | "Listening" | "Watching" | "Competing";
      activityText: string;
    };
  };
  welcome: {
    enabled: boolean;
    channelId: string;
    mode: WelcomeMode;
    messageTemplate: string;
    embed: {
      color: string;
      title: string;
      description: string;
      footer: string;
      showThumbnail: boolean;
    };
    image: {
      enabled: boolean;
      width: number;
      height: number;
      background: {
        type: "gradient" | "color";
        colorA: string;
        colorB: string;
      };
      title: string;
      subtitle: string;
      accentColor: string;
      showMemberCount: boolean;
    };
  };
  tickets: {
    enabled: boolean;
    categoryId: string;
    panelChannelId: string;
    panel: {
      title: string;
      description: string;
      color: string;
      buttonLabel: string;
      buttonEmoji: string;
      image: {
        enabled: boolean;
        width: number;
        height: number;
        colorA: string;
        colorB: string;
        title: string;
        subtitle: string;
      };
    };
    transcripts: {
      channelId: string;
    };
    naming: {
      prefix: string;
    };
    limits: {
      maxOpenPerUser: number;
    };
    priorities: {
      default: string;
      levels: Record<string, { label: string; emoji: string }>;
    };
    roles: {
      staffRoleIds: string[];
      mentionOnCreate: boolean;
    };
    messages: {
      createdTitle: string;
      createdDescription: string;
      outsideHoursNotice: string;
      noMoreTickets: string;
    };
    forms: {
      title: string;
      fields: Array<{
        key: string;
        label: string;
        style: FormFieldStyle;
        required: boolean;
        placeholder: string;
        minLength: number;
        maxLength: number;
      }>;
    };
    officeHours: {
      timezone: string;
      monday: string;
      tuesday: string;
      wednesday: string;
      thursday: string;
      friday: string;
      saturday: string;
      sunday: string;
    };
  };
  pokemon: {
    enabled: boolean;
    starters: string[];
    rarityWeights: {
      common: number;
      uncommon: number;
      rare: number;
      legendary: number;
    };
    xp: {
      trainMin: number;
      trainMax: number;
      levelCurveBase: number;
    };
    economy: {
      catchCooldownMinutes: number;
      trainCooldownMinutes: number;
    };
    messages: {
      catchSuccess: string;
      noStarter: string;
    };
  };
}
