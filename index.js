#!/usr/bin/env node

const { program } = require("commander");
const ora = require("ora");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const configDir = path.join(require("os").homedir(), ".ai-cli");
const configPath = path.join(configDir, "config.json");

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function promptUser(question) {
  return new Promise((resolve) => {
    const rl = createReadlineInterface();
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch (error) {
    console.error("Error reading config file:", error.message);
  }
  return {};
}

// Save configuration
function saveConfig(config) {
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("Error saving config file:", error.message);
    return false;
  }
}

// Get API Key
async function getAPIKey() {
  const config = loadConfig();

  if (config.apiKey) {
    return config.apiKey;
  }

  console.log("\n🔧 First time setup required!");
  console.log("You need to configure your OpenRouter API Key.");
  console.log("You can find this by going to https://openrouter.com. \n");

  const apiKey = await promptUser("Enter your OpenRouter API Key: ");

  if (!apiKey) {
    console.error("❌ OpenRouter API Key is required to use this CLI tool.");
    process.exit(1);
  }

  config.apiKey = apiKey;
  if (saveConfig(config)) {
    console.log("✅ OpenRouter API Key saved successfully!\n");
  } else {
    console.error(
      "❌ Failed to save OpenRouter API Key. You'll need to enter it again next time.\n"
    );
  }

  return apiKey;
}

async function handleStreamingResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim() === "") continue;
        if (line.startsWith("data: ")) {
          const data = line.slice(6); // Remove 'data: ' prefix

          if (data === "[DONE]") {
            console.log("\n"); // Add final newline
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (
              parsed.choices &&
              parsed.choices[0] &&
              parsed.choices[0].delta
            ) {
              const content = parsed.choices[0].delta.content;
              if (content) {
                process.stdout.write(content); // Stream output without newlines
              }
            }
          } catch (parseError) {
            // Skip malformed JSON chunks
            continue;
          }
        }
      }
    }
  } catch (error) {
    console.error("\n❌ Error reading stream:", error.message);
  } finally {
    reader.releaseLock();
  }
}

async function sendAIQuery(query, useStreaming = true) {
  try {
    const apiKey = await getAPIKey();
    const spinner = ora(`Sending query: "${query}"`).start();

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "AI CLI",
          "X-Title": "AI CLI",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: query,
            },
          ],
          stream: useStreaming,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (useStreaming) {
      spinner.succeed("Connected! Streaming response...\n");
      await handleStreamingResponse(response);
    } else {
      const data = await response.json();
      spinner.succeed("Query sent successfully!");

      if (data.choices && data.choices[0] && data.choices[0].message) {
        console.log("\n" + data.choices[0].message.content);
      } else {
        console.log("Response:", JSON.stringify(data, null, 2));
      }
    }
  } catch (error) {
    console.error("❌ Failed to send query");
    console.error("Error:", error.message);
  }
}

program
  .name("ai")
  .description("Unofficial CLI Tool for Open Router API")
  .version("1.0.0");

// Configuration command
program
  .command("config")
  .description("Manage configuration")
  .option("--set-api-key <api-key>", "set your OpenRouter API Key")
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
    } else if (options.show) {
      console.log("📋 Current configuration:");
      console.log("OpenRouter API Key:", config.apiKey || "Not set");
      console.log("Config file:", configPath);
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

// Default action with streaming support
program
  .argument("[query]", "AI query to send")
  .option("--no-stream", "disable streaming (get complete response at once)")
  .action(async (query, options) => {
    if (query) {
      const useStreaming = options.stream !== false; // Default to true
      await sendAIQuery(query, useStreaming);
    } else {
      program.help();
    }
  });

program.parse();
