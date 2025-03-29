import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { i18n } from "../utils/i18n";
import { getStats } from "../utils/stats";
import { log, error as logError } from "../utils/logger";

/**
 * Converts a total number of minutes into a human-readable format.
 * If the value is less than 60, it shows minutes; if less than 24 hours,
 * it shows hours and minutes; otherwise, it shows days, hours, and minutes.
 *
 * @param totalMinutes - The total minutes to format.
 * @returns A formatted string representing the time.
 */
function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${totalMinutes.toFixed(1)} minutes`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return `${hours} hours, ${minutes.toFixed(1)} minutes`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days} days, ${remHours} hours, ${minutes.toFixed(1)} minutes`;
}

/**
 * Truncates a string to a maximum length, appending "..." if it was truncated.
 * @param str - The string to truncate.
 * @param maxLength - The maximum allowed length.
 * @returns The truncated string.
 */
function truncateString(str: string, maxLength: number): string {
  return str.length > maxLength ? str.slice(0, maxLength - 3) + "..." : str;
}

export default {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Display statistics about the bot usage."),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // Retrieve the current stats.
      const stats = getStats();

      // Format global total listening time.
      const globalListeningFormatted = formatMinutes(stats.totalListeningMinutes.global);

      // Get the personal listening time for the requestor.
      const personalListening = stats.totalListeningMinutes.perUser[interaction.user.id] || 0;
      const personalListeningFormatted = formatMinutes(personalListening);

      // Compute total songs played by summing the played counts of all songs.
      const totalSongsPlayed = Object.values(stats.songs).reduce((acc, song) => acc + song.played, 0);
      // Total unique songs from the stats.
      const totalUniqueSongs = Object.keys(stats.songs).length;
      // Total unique requesters from the songRequests.
      const totalUniqueRequesters = Object.keys(stats.songRequests).length;

      // Prepare the top 5 most played songs.
      let topPlayedSongs = Object.entries(stats.songs)
        .sort(([, a], [, b]) => b.played - a.played)
        .slice(0, 5)
        .map(([url, data]) => `- [**${data.title}**](<${url}>) — ${data.played} plays, ${data.skipped} skips`)
        .join("\n");
      if (!topPlayedSongs.trim()) {
        topPlayedSongs = "No song statistics available";
      }
      // Truncate the top songs string to Discord's embed field limit (1024 characters)
      const truncatedTopPlayedSongs = truncateString(topPlayedSongs, 1024);

      // Determine the top 3 listeners by total listening time.
      let topListeners = Object.entries(stats.totalListeningMinutes.perUser)
        .filter(([userId]) => userId !== "unknown")
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([userId, minutes]) => `<@${userId}>: ${formatMinutes(minutes)}`)
        .join("\n");
      if (!topListeners.trim()) {
        topListeners = "No listener data available";
      }
      const truncatedTopListeners = truncateString(topListeners, 1024);

      // Create an embed to display the statistics.
      const embed = new EmbedBuilder()
        .setTitle("Bot Statistics")
        .setColor(0x00AE86)
        .addFields(
          { name: "Global Total Listening Time", value: globalListeningFormatted, inline: false },
          { name: "Your Listening Time", value: personalListeningFormatted, inline: false },
          { name: "Total Songs Played", value: totalSongsPlayed.toString(), inline: true },
          { name: "Total Unique Songs", value: totalUniqueSongs.toString(), inline: true },
          { name: "Total Unique Requesters", value: totalUniqueRequesters.toString(), inline: true },
          { name: "Top 5 Most Played Songs", value: truncatedTopPlayedSongs, inline: false },
          { name: "Top 3 Listeners", value: truncatedTopListeners, inline: false }
        )
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    } catch (err) {
      logError("[Stats] Error retrieving statistics:", err as Error);
      return interaction.reply({
        content: i18n.__("stats.error"),
        ephemeral: true
      });
    }
  },
};