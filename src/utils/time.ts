import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const dayMap = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
] as const;

export type WeekDayKey = (typeof dayMap)[number];

export interface OfficeHoursConfig {
  timezone: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
}

export interface OfficeHoursResult {
  inHours: boolean;
  currentTime: string;
  nextOpening: string;
}

function parseRange(value: string): { start: number; end: number } | null {
  if (value.toLowerCase() === "closed") {
    return null;
  }

  const [startRaw, endRaw] = value.split("-");
  if (!startRaw || !endRaw) {
    return null;
  }

  const toMinutes = (raw: string): number => {
    const [h, m] = raw.trim().split(":");
    const hours = Number(h);
    const minutes = Number(m);
    return hours * 60 + minutes;
  };

  return {
    start: toMinutes(startRaw),
    end: toMinutes(endRaw)
  };
}

export function evaluateOfficeHours(config: OfficeHoursConfig): OfficeHoursResult {
  const now = dayjs().tz(config.timezone);
  const nowMinutes = now.hour() * 60 + now.minute();
  const dayKey = dayMap[now.day()];
  const today = parseRange(config[dayKey]);

  const currentTime = now.format("HH:mm");

  if (today && nowMinutes >= today.start && nowMinutes <= today.end) {
    return { inHours: true, currentTime, nextOpening: currentTime };
  }

  for (let i = 0; i < 7; i += 1) {
    const check = now.add(i, "day");
    const checkDay = dayMap[check.day()];
    const parsed = parseRange(config[checkDay]);
    if (!parsed) {
      continue;
    }

    if (i === 0 && nowMinutes < parsed.start) {
      return {
        inHours: false,
        currentTime,
        nextOpening: now.hour(0).minute(0).add(parsed.start, "minute").format("ddd HH:mm")
      };
    }

    if (i > 0) {
      return {
        inHours: false,
        currentTime,
        nextOpening: check.hour(0).minute(0).add(parsed.start, "minute").format("ddd HH:mm")
      };
    }
  }

  return {
    inHours: false,
    currentTime,
    nextOpening: "sin horario configurado"
  };
}
