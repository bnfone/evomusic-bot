import { CommandInteraction, ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";
import { error as logError } from "./logger";

// Set your GitHub issue reporting URL here
const GITHUB_ISSUE_URL = "https://github.com/bnfone/discord-bot-evomusic/issues/new?assignees=&labels=feature&template=---bug-report.md&title=";

/**
 * Handles errors by logging the full error and notifying the Discord user.
 * A short explanation (the error message) is printed to the console,
 * while the full error (including stack trace) is saved in the logs.
 * @param interaction - The Discord interaction during which the error occurred.
 * @param err - The error object.
 */
export async function handleError(interaction: CommandInteraction, err: Error): Promise<void> {
  // Log the full error with our logger
  logError("Error in command execution", err);

  // Create an embed message to notify the user with a short error message
  const errorEmbed = new EmbedBuilder()
    .setTitle("An error occurred")
    .setDescription(`**Error:** ${err.message}\nPlease report this issue if it persists.`)
    .setColor(0xff0000)
    .setTimestamp();

  // Create a button that links to the GitHub issue page for error reporting
  const button = new ButtonBuilder()
    .setLabel("Report Issue on GitHub")
    .setStyle(ButtonStyle.Link)
    .setURL(GITHUB_ISSUE_URL);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  // Inform the user in Discord (using followUp if already deferred/replied)
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds: [errorEmbed], components: [row], ephemeral: true });
  } else {
    await interaction.reply({ embeds: [errorEmbed], components: [row], ephemeral: true });
  }

  // Also output a short error message with the reporting link in the console
  console.error(`Error: ${err.message}. Report this error at: ${GITHUB_ISSUE_URL}`);
}