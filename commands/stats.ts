import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { i18n } from "../utils/i18n";
import { getStats } from "../utils/stats";

export default {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Display statistics about the bot usage."),
  async execute(interaction: ChatInputCommandInteraction) {
    const stats = getStats();

    // Bereite eine einfache Übersicht vor.
    const mostPlayedSongs = Object.entries(stats.songs)
      .sort(([, a], [, b]) => b.played - a.played)
      .slice(0, 5)
      .map(([url, data]) => `- ${url} (${data.played} plays, ${data.skipped} skips)`)
      .join("\n");

    const mostPopularSources = Object.entries(stats.sources)
      .sort(([, a], [, b]) => b - a)
      .map(([source, count]) => `- ${source}: ${count} plays`)
      .join("\n");

    const response = `
**Total Songs Requested:** ${stats.totalSongsRequested.global}
**Total Listening Minutes:** ${stats.totalListeningMinutes.global} minutes

**Top 5 Most Played Songs:**
${mostPlayedSongs}

**Most Popular Sources:**
${mostPopularSources}
    `;

    return interaction.reply({
      content: response,
      ephemeral: true,
    });
  },
};