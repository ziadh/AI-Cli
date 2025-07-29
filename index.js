#!/usr/bin/env node

const { program } = require("commander");
const ora = require("ora");
const fs = require("fs"); // Keep fs for unlinkSync in config reset
const { promptUser } = require("./src/utils");
const { loadConfig, saveConfig, configPath, DEFAULT_MODEL } = require("./src/config");
const { saveContext, loadContext, listContexts, deleteContext, contextDir } = require("./src/context");
const { sendAIQueryWithContext, sendAIQuery } = require("./src/api");

program
  .name("ai")
  .description("Unofficial CLI Tool for Open Router API with Smart Context Management")
  .version("1.0.0");

// Configuration command
program
  .command("config")
  .description("Manage configuration")
  .option("--set-api-key <api-key>", "set your OpenRouter API Key")
  .option("--set-model <model>", "set default model (e.g., openai/gpt-4o, anthropic/claude-3.5-sonnet)")
  .option("--set-provider <provider>", "set AI provider (openrouter or ollama)")
  .option("--set-ollama-model <model>", "set Ollama model ID")
  .option("--set-ollama-url <url>", "set Ollama base URL")
  .option("--show", "show current configuration")
  .option("--reset", "reset all configuration")
  .action(async (options) => {
    const config = loadConfig();

    if (options.setApiKey) {
      config.apiKey = options.setApiKey;
      if (saveConfig(config)) {
        console.log("✅ OpenRouter API Key updated successfully!");
      } else {
        console.error("❌ Failed to save configuration.");
      }
    } else if (options.setModel) {
      config.model = options.setModel;
      if (saveConfig(config)) {
        console.log(`✅ Default model set to: ${options.setModel}`);
      } else {
        console.error("❌ Failed to save configuration.");
      }
    } else if (options.setProvider) {
      const provider = options.setProvider.toLowerCase();
      if (provider !== "openrouter" && provider !== "ollama") {
        console.error("❌ Provider must be 'openrouter' or 'ollama'");
        return;
      }
      config.provider = provider;
      if (saveConfig(config)) {
        console.log(`✅ AI provider set to: ${provider}`);
        if (provider === "ollama") {
          console.log("💡 Don't forget to set your Ollama model with --set-ollama-model");
        }
      } else {
        console.error("❌ Failed to save configuration.");
      }
    } else if (options.setOllamaModel) {
      config.ollamaModel = options.setOllamaModel;
      if (saveConfig(config)) {
        console.log(`✅ Ollama model set to: ${options.setOllamaModel}`);
      } else {
        console.error("❌ Failed to save configuration.");
      }
    } else if (options.setOllamaUrl) {
      config.ollamaUrl = options.setOllamaUrl;
      if (saveConfig(config)) {
        console.log(`✅ Ollama URL set to: ${options.setOllamaUrl}`);
      } else {
        console.error("❌ Failed to save configuration.");
      }
    } else if (options.show) {
      console.log("📋 Current configuration:");
      console.log("AI Provider:", config.provider || "openrouter");
      console.log("OpenRouter API Key:", config.apiKey || "Not set");
      console.log("Default Model:", config.model || DEFAULT_MODEL);
      console.log("Ollama Model:", config.ollamaModel || "Not set");
      console.log("Ollama URL:", config.ollamaUrl || "http://localhost:11434");
      console.log("Config file:", configPath);
      console.log("Contexts directory:", contextDir);
      console.log("\n💡 Popular models:");
      console.log("OpenRouter models:");
      console.log("  • openai/gpt-4o");
      console.log("  • openai/gpt-4o-mini");
      console.log("  • anthropic/claude-3.5-sonnet");
      console.log("  • anthropic/claude-3-haiku");
      console.log("  • google/gemini-pro-1.5");
      console.log("  • meta-llama/llama-3.1-70b-instruct");
      console.log("\nOllama models (must be pulled first):");
      console.log("  • llama3.1 (default)");
      console.log("  • llama3");
      console.log("  • mistral");
      console.log("  • gemma2");
    } else if (options.reset) {
      const confirm = await promptUser(
        "Are you sure you want to reset all configuration? (y/N): "
      );
      if (confirm.toLowerCase() === "y" || confirm.toLowerCase() === "yes") {
        try {
          if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
          }
          console.log("✅ Configuration reset successfully!");
        } catch (error) {
          console.error("❌ Failed to reset configuration:", error.message);
        }
      } else {
        console.log("Configuration reset cancelled.");
      }
    } else {
      console.log("Use --help to see available config options");
    }
  });

// Chat command for context management
program
  .command("chat")
  .argument("<message>", "start or continue a conversation")
  .option("--context <name>", "conversation context name", "default")
  .option("--model <model>", "override default model for this query")
  .option("--new", "start a new conversation (clears context)")
  .option("--no-stream", "disable streaming")
  .action(async (message, options) => {
    let context = null;
    let messages = [];

    if (!options.new) {
      context = await loadContext(options.context);
      if (context) {
        messages = context.messages;
        console.log(`💬 Continuing conversation in context "${options.context}" (${messages.length} messages)`);
      } else {
        console.log(`💬 Starting new conversation in context "${options.context}"`);
      }
    } else {
      console.log(`💬 Starting fresh conversation in context "${options.context}"`);
    }

    messages.push({ role: "user", content: message });
    const useStreaming = options.stream !== false;
    await sendAIQueryWithContext(messages, options.context, useStreaming, options.model);
  });

// Quick continue with + command
program
  .command("+")
  .argument("<message>", "quickly continue the default conversation")
  .option("--model <model>", "override default model for this query")
  .option("--no-stream", "disable streaming")
  .action(async (message, options) => {
    let context = await loadContext("default");
    let messages = [];

    if (context) {
      messages = context.messages;
      console.log(`⚡ Quick continue (${messages.length} messages in context)`);
    } else {
      console.log("⚡ Quick start (no previous context)");
    }

    messages.push({ role: "user", content: message });
    const useStreaming = options.stream !== false;
    await sendAIQueryWithContext(messages, "default", useStreaming, options.model);
  });

// Context management command
program
  .command("context")
  .description("Manage conversation contexts")
  .option("--list", "list all contexts")
  .option("--show <name>", "show context details")
  .option("--delete <name>", "delete a context")
  .option("--clear <name>", "clear a context (keep name, remove messages)")
  .action(async (options) => {
    if (options.list) {
      const contexts = await listContexts();
      if (contexts.length === 0) {
        console.log("📭 No contexts found");
        return;
      }

      console.log("📚 Available contexts:");
      contexts.forEach(ctx => {
        const lastUpdated = new Date(ctx.lastUpdated).toLocaleDateString();
        console.log(`  • ${ctx.name} (${ctx.messageCount} messages, updated ${lastUpdated})`);
      });
    } else if (options.show) {
      const context = await loadContext(options.show);
      if (!context) {
        console.log(`❌ Context "${options.show}" not found`);
        return;
      }

      console.log(`📖 Context: ${context.name}`);
      console.log(`Created: ${new Date(context.createdAt).toLocaleString()}`);
      console.log(`Updated: ${new Date(context.updatedAt).toLocaleString()}`);
      console.log(`Messages: ${context.messages.length}`);
      console.log("\n💬 Conversation preview:");

      context.messages.slice(-4).forEach((msg, i) => {
        const role = msg.role === 'user' ? '👤' : '🤖';
        const preview = msg.content.length > 100
          ? msg.content.substring(0, 100) + "..."
          : msg.content;
        console.log(`  ${role} ${preview}`);
      });
    } else if (options.delete) {
      const success = await deleteContext(options.delete);
      if (success) {
        console.log(`✅ Context "${options.delete}" deleted successfully`);
      } else {
        console.log(`❌ Context "${options.delete}" not found`);
      }
    } else if (options.clear) {
      const success = await saveContext(options.clear, []);
      if (success) {
        console.log(`✅ Context "${options.clear}" cleared successfully`);
      } else {
        console.log(`❌ Failed to clear context "${options.clear}"`);
      }
    } else {
      console.log("Use --help to see available context options");
    }
  });

// Default action (single query, no context)
program
  .argument("[query]", "AI query to send")
  .option("--model <model>", "override default model for this query")
  .option("--no-stream", "disable streaming")
  .action(async (query, options) => {
    if (query) {
      const useStreaming = options.stream !== false;
      await sendAIQuery(query, useStreaming, options.model);
    } else {
      program.help();
    }
  });

program.parse();
