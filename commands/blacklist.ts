import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionsBitField } from "discord.js";
import { i18n } from "../utils/i18n";
import { addUserToBlacklist, addSongToBlacklist } from "../utils/blacklist";
import { bot } from "../index";

export default {
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Blacklist a user or a song (Admin-only)")
    .addSubcommand(subcommand =>
      subcommand
        .setName("user")
        .setDescription("Blacklist a user by mention or user ID")
        .addStringOption(option =>
          option
            .setName("target")
            .setDescription("User mention (e.g. @User) or user ID")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("song")
        .setDescription("Blacklist a song by YouTube URL or block the currently playing song")
        .addStringOption(option =>
          option
            .setName("target")
            .setDescription("Either a YouTube URL or type 'current' to block the current song")
            .setRequired(true)
        )
    ),
  // Restrict this command to admins
  permissions: [PermissionsBitField.Flags.Administrator],
  async execute(interaction: ChatInputCommandInteraction) {
    // Fetch the complete member object to ensure we have accurate permission data.
    const member = await interaction.guild!.members.fetch(interaction.user.id);

    // Check if the member has Administrator permissions.
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === "user") {
      const target = interaction.options.getString("target", true);
      // Extract the user ID from a mention if applicable
      const mentionRegex = /^<@!?(\d+)>$/;
      const match = target.match(mentionRegex);
      const userId = match ? match[1] : target;
      
      addUserToBlacklist(userId);
      return interaction.reply({ content: `User with ID ${userId} has been blacklisted.`, ephemeral: true });
    } else if (subcommand === "song") {
      const target = interaction.options.getString("target", true);
      let songIdentifier: string;

      if (target.toLowerCase() === "current") {
        // Get the currently playing song from the guild's queue
        const queue = bot.queues.get(interaction.guild!.id);
        if (!queue || queue.songs.length === 0) {
          return interaction.reply({ content: "No song is currently playing.", ephemeral: true });
        }
        songIdentifier = queue.songs[0].url;
      } else {
        // Assume the provided target is a YouTube URL
        songIdentifier = target;
      }

      addSongToBlacklist(songIdentifier);
      return interaction.reply({ content: `Song ${songIdentifier} has been blacklisted.`, ephemeral: true });
    }
  }
};