import "dotenv/config";
import { REST, Routes } from "discord.js";
import { profileCommand, rateCommand, tradeCommand } from "../src/commands/index.js";
function resolveEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not defined.`);
    }
    return value;
}
(async () => {
    const token = resolveEnv("DISCORD_TOKEN");
    const clientId = resolveEnv("CLIENT_ID");
    const guildId = resolveEnv("GUILD_ID");
    const commands = [tradeCommand.data, rateCommand.data, profileCommand.data];
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands.map((command) => command.toJSON()),
    });
    console.log(`Registered ${commands.length} commands for guild ${guildId}`);
})().catch((error) => {
    console.error("Failed to register commands", error);
    process.exit(1);
});
