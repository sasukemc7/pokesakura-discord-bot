# Network Bot

Bot de Discord avanzado en TypeScript con Discord.js v14, SQLite y configuracion YAML.

## Incluye

- Sistema de bienvenida configurable (`embed`, `image` o `both`).
- Imagen de bienvenida con avatar, username y contador de miembros.
- Sistema de tickets con:
  - Panel persistente (actualiza en lugar de duplicar).
  - Formulario configurable desde `config.yml`.
  - Horarios de atencion por dia en timezone configurable.
  - Prioridades (low/medium/high/urgent) con reorganizacion de canal.
  - Roles de staff configurables y dinamicos por comandos.
  - Comandos `/staff add`, `/staff remove`, `/ticket rename`, `/ticket priority`.
  - Transcripcion TXT al cerrar ticket.
- Sistema Pokemon tipo pets:
  - `/pokemon starter`, `/pokemon catch`, `/pokemon party`, `/pokemon active`, `/pokemon train`, `/pokemon profile`.
  - Rarezas, cooldowns y curva de experiencia configurables.

## Stack

- Node.js + TypeScript
- discord.js v14
- SQLite (`better-sqlite3`)
- YAML + Zod para config validada
- Canvas para imagenes de bienvenida y panel de tickets

## Instalacion

1. Instala dependencias:

```bash
npm install
```

2. Crea archivo `.env` usando `.env.example`.

3. Edita `config.yml` con IDs reales:

- `welcome.channelId`
- `tickets.categoryId`
- `tickets.panelChannelId`
- `tickets.roles.staffRoleIds`

4. Registra slash commands:

```bash
npm run register
```

5. Inicia el bot:

```bash
npm run start
```

Para desarrollo en caliente:

```bash
npm run dev
```

## Comandos disponibles

- `/staff add rol:@Rol`
- `/staff remove rol:@Rol`
- `/ticket rename nombre:nuevo-nombre`
- `/ticket priority nivel:urgent`
- `/pokemon starter pokemon:Pikachu`
- `/pokemon catch`
- `/pokemon party`
- `/pokemon active id:12`
- `/pokemon train`
- `/pokemon profile`

## Estructura

- `src/index.ts`: bootstrap del bot y eventos.
- `src/config/loadConfig.ts`: carga y valida `config.yml`.
- `src/db/database.ts`: inicializacion y migracion SQLite.
- `src/services/welcomeService.ts`: flujo de bienvenidas.
- `src/services/ticketService.ts`: flujo de tickets, panel y acciones.
- `src/services/pokemonService.ts`: sistema Pokemon.
- `src/commands/buildCommands.ts`: definicion de slash commands.
- `src/registerCommands.ts`: despliegue de comandos.

## Extras utiles incluidos

- Panel de tickets idempotente con hash para no duplicar mensajes.
- Soporte de override de staff en DB (comandos) y fallback a config.
- Guardado de mensajes de ticket para transcripcion.
- Cooldowns de Pokemon persistidos en DB.

## Notas de produccion recomendadas

- Usa comandos por `DISCORD_GUILD_ID` en desarrollo, y global en produccion.
- Mantener backups de `data/bot.sqlite`.
- Si ejecutas en Linux/hosting sin librerias graficas, instala dependencias del sistema para `canvas`.
