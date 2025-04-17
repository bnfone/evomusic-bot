import { CommandInteraction, ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";
import logger from '../utils/logger';
import { i18n } from "./i18n";
import { v4 as uuid } from "uuid";  

// Set your GitHub issue reporting URL here
const GITHUB_ISSUE_URL = "https://github.com/bnfone/discord-bot-evomusic/issues/new?assignees=&labels=feature&template=---bug-report.md&title=";

/**
 * Handles errors by logging the full error and notifying the Discord user.
 * A short explanation (the error message) is printed to the console,
 * while the full error (including stack trace) is saved in the logs.
 * @param interaction - The Discord interaction during which the error occurred.
 * @param err - The error object.
 */
export async function handleError(
  interaction: CommandInteraction | null,
  err: Error
): Promise<void> {
  // 1) generiere Error‑Code
  const errorCode = uuid().slice(0, 8);
  // 2) log mit Code
  logger.error(`[${errorCode}] Error in command execution`, err);

  // 3) baue Embed mit lokalisierter Beschreibung und Code‑Footer
  const embed = new EmbedBuilder()
    .setTitle(i18n.__("error.title"))
    .setDescription(i18n.__mf("error.description", { error: err.message }))
    .setColor(0xff0000)
    .setTimestamp()
    .setFooter({ text: `Error Code: ${errorCode}` });

  // Button wie gehabt…
  const button = new ButtonBuilder()
    .setLabel(i18n.__("error.reportButton"))
    .setStyle(ButtonStyle.Link)
    .setURL(GITHUB_ISSUE_URL);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  // 4) reply/followUp
  if (interaction) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds: [embed], components: [row], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
  }
}