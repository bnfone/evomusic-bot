import {
  ApplicationCommandDataResolvable,
  ChatInputCommandInteraction,
  Client,
  Collection,
  Events,
  Interaction,
  REST,
  Routes,
  Snowflake,
  ActivityType
} from "discord.js";
import { readdirSync } from "fs";
import { join } from "path";
import { Command } from "../interfaces/Command";
import { checkPermissions, PermissionResult } from "../utils/checkPermissions";
import { config } from "../utils/config";
import { i18n } from "../utils/i18n";
import { MissingPermissionsException } from "../utils/MissingPermissionsException";
import { MusicQueue } from "./MusicQueue";
import { isUserBlacklisted, loadBlacklist } from "../utils/blacklist";
import { loadFavorites } from "../utils/favorites";
import { loadStats } from "../utils/stats";
import { handleError } from "../utils/errorHandler";
import { logCommandUsage, log, error as logError } from "../utils/logger";
// Import the new voice utilities.
import { registerVoiceListeners } from "../utils/voiceUtils";

export class Bot {
  public readonly prefix = "/";
  public commands = new Collection<string, Command>();
  public slashCommands = new Array<ApplicationCommandDataResolvable>();
  public slashCommandsMap = new Collection<string, Command>();
  public cooldowns = new Collection<string, Collection<Snowflake, number>>();
  public queues = new Collection<Snowflake, MusicQueue>();

  public constructor(public readonly client: Client) {
    // Login the bot using the token from config.
    this.client.login(config.TOKEN);

    this.client.on("ready", async () => {
      console.log(`${this.client.user!.username} ready!`);

      // Set the bot's presence.
      this.client.user!.setPresence({
        activities: [{ name: 'Spotify & Apple Music', type: ActivityType.Listening }],
        status: 'online'
      });

      // Load persistent data (blacklist, favorites, stats, etc.) before registering commands.
      await loadBlacklist().catch(console.error);
      await loadFavorites().catch(console.error);
      await loadStats().catch(console.error);

      // Register slash commands.
      this.registerSlashCommands().catch(console.error);

      // Register voice state update listeners (for tracking listening time and auto-disconnect).
      registerVoiceListeners(this.client, this.queues);
    });

    this.client.on("warn", (info) => console.log(info));
    this.client.on("error", console.error);

    // Setup global interaction handler.
    this.onInteractionCreate();
  }

  // Registers all slash commands by reading the commands folder.
  private async registerSlashCommands() {
    const rest = new REST({ version: "9" }).setToken(config.TOKEN);

    const commandFiles = readdirSync(join(__dirname, "..", "commands")).filter((file) => !file.endsWith(".map"));

    for (const file of commandFiles) {
      const command = await import(join(__dirname, "..", "commands", `${file}`));
      this.slashCommands.push(command.default.data);
      this.slashCommandsMap.set(command.default.data.name, command.default);
    }

    await rest.put(Routes.applicationCommands(this.client.user!.id), { body: this.slashCommands });
  }

  // Global handler for all incoming slash command interactions.
  private async onInteractionCreate() {
    this.client.on(Events.InteractionCreate, async (interaction: Interaction): Promise<any> => {
      // Only process ChatInputCommands.
      if (!interaction.isChatInputCommand()) return;

      const command = this.slashCommandsMap.get(interaction.commandName);
      if (!command) return;

      // Global blacklist check.
      if (isUserBlacklisted(interaction.user.id)) {
        return interaction.reply({
          content: i18n.__("common.userBlacklisted"),
          ephemeral: true
        });
      }

      // Log command usage for statistics.
      logCommandUsage(interaction.user.id, interaction.commandName, interaction.options.data);

      // Cooldown setup.
      if (!this.cooldowns.has(interaction.commandName)) {
        this.cooldowns.set(interaction.commandName, new Collection());
      }
      const now = Date.now();
      const timestamps = this.cooldowns.get(interaction.commandName)!;
      const cooldownAmount = (command.cooldown || 1) * 1000;
      const timestamp = timestamps.get(interaction.user.id);
      if (timestamp) {
        const expirationTime = timestamp + cooldownAmount;
        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          return interaction.reply({
            content: i18n.__mf("common.cooldownMessage", {
              time: timeLeft.toFixed(1),
              name: interaction.commandName
            }),
            ephemeral: true
          });
        }
      }
      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

      try {
        // Check necessary permissions.
        const permissionsCheck: PermissionResult = await checkPermissions(command, interaction);
        if (!permissionsCheck.result) {
          throw new MissingPermissionsException(permissionsCheck.missing);
        }
        // Execute the command.
        await command.execute(interaction as ChatInputCommandInteraction);
      } catch (error: any) {
        // Use unified error handling.
        await handleError(interaction as ChatInputCommandInteraction, error);
      }
    });
  }
}