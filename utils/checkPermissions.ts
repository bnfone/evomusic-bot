import { ChatInputCommandInteraction, PermissionResolvable } from "discord.js";
import { Command } from "../interfaces/Command";

export interface PermissionResult {
  result: boolean;
  missing: string[];
}

export async function checkPermissions(
  command: Command,
  interaction: ChatInputCommandInteraction
): Promise<PermissionResult> {
  // Fetch the member for the user who executed the command
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  const requiredPermissions = command.permissions as PermissionResolvable[];

  if (!command.permissions) return { result: true, missing: [] };

  const missing = member.permissions.missing(requiredPermissions);
  return { result: missing.length === 0, missing };
}