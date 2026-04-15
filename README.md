# Network Bot

An open source, modular, and configurable Discord bot for communities that need serious support tooling (tickets), visual onboarding (welcome messages), and gamified Pokemon RPG features.

Built with TypeScript, Discord.js v14, SQLite, and validated YAML configuration.

## Features

### Welcome System

- Enable or disable from config.
- `embed`, `image`, or `both` modes.
- Welcome image with avatar, username, and member count.
- Messages with dynamic variables such as `{userMention}` and `{memberCount}`.

### Ticket System

- Persistent, idempotent panel that does not duplicate on restart.
- Configurable ticket modal in `config.yml`.
- Per-day support hours with timezone awareness (`America/Bogota` or any other).
- Priorities (`low`, `medium`, `high`, `urgent`) with channel reordering.
- Staff roles defined in config and managed via commands (`/staff add`, `/staff remove`).
- Automatic TXT transcript when closing a ticket.
- Progressive channel naming per user, for example: `ticket-user-1`.

### Pokemon RPG System

- Starter, catch, party, active, train, profile, info, leaderboard, and missions.
- Visual capture flow with progress bars and dynamic embeds.
- Real Pokemon images via PokeAPI with runtime caching.
- Advanced Pokemon metadata:
  - Shinies.
  - Nature.
  - Title.
  - IVs (HP, ATK, DEF, SpA, SpD, SPD).
  - Bond.
- Trainer progression system:
  - Points.
  - Rank.
  - Daily streaks.
  - Catches, training, and shinies.
- Daily missions with automatic point rewards.
- Server leaderboard.

## Tech Stack

- Node.js
- TypeScript
- discord.js v14
- SQLite (`better-sqlite3`)
- YAML + Zod
- Canvas for welcome and ticket panel images

## Quick Start

1. Install dependencies.

```bash
npm install
```

Using pnpm:

```bash
pnpm install
```

2. Create `.env` from `.env.example`.

3. Configure real IDs in `config.yml`.

Recommended minimum fields:

- `welcome.channelId`
- `tickets.categoryId`
- `tickets.panelChannelId`
- `tickets.transcripts.channelId`
- `tickets.roles.staffRoleIds`

4. Register slash commands.

```bash
npm run register
```

Using pnpm:

```bash
pnpm run register
```

5. Start the bot.

```bash
npm run dev
```

Production:

```bash
npm run start
```

## Environment Variables

- `DISCORD_TOKEN`: bot token.
- `DISCORD_CLIENT_ID`: application/client ID.
- `DISCORD_GUILD_ID`: optional, useful for fast per-server command registration.

## Commands

### Tickets

- `/staff add rol:@Role`
- `/staff remove rol:@Role`
- `/ticket rename nombre:new-name`
- `/ticket priority nivel:urgent`

### Pokemon

- `/pokemon starter pokemon:Pikachu`
- `/pokemon catch`
- `/pokemon party`
- `/pokemon active id:12`
- `/pokemon train`
- `/pokemon profile`
- `/pokemon info id:12`
- `/pokemon leaderboard`
- `/pokemon missions`

## Project Structure

- `src/index.ts`: bootstrap and events.
- `src/config/loadConfig.ts`: loads and validates `config.yml`.
- `src/db/database.ts`: SQLite schema and migrations.
- `src/services/welcomeService.ts`: welcome flow.
- `src/services/ticketService.ts`: ticket system.
- `src/services/pokemonService.ts`: Pokemon RPG system.
- `src/services/pokemonApi.ts`: PokeAPI image integration.
- `src/commands/buildCommands.ts`: slash command definitions.
- `src/registerCommands.ts`: Discord API command registration.

## Suggested Roadmap

- Evolution system with level and condition requirements.
- PvE battles against weekly bosses.
- Seasonal PvP with ELO/ranking.
- Items, marketplace, and internal economy.
- Web dashboard for moderation and real-time config.

## Contributing

Pull requests and issues are welcome.

- Report bugs with reproduction steps.
- Attach relevant logs when applicable.
- Propose features with real usage context.

## Deployment Notes

- Back up `data/bot.sqlite` regularly.
- On Linux, install the required system dependencies for `canvas`.
- Global slash commands can take a few minutes to propagate.

## License

MIT
