const fs = require("fs");
const path = require("path");
const os = require("os");

const configDir = path.join(os.homedir(), ".ai-cli");
const configPath = path.join(configDir, "config.json");
const DEFAULT_MODEL = "openai/gpt-4o";
const DEFAULT_OLLAMA_MODEL = "llama3.1";
const DEFAULT_OLLAMA_URL = "http://localhost:11434";

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      // Set default values if not specified
      if (!config.model) {
        config.model = DEFAULT_MODEL;
      }
      if (!config.provider) {
        config.provider = "openrouter";
      }
      if (!config.ollamaUrl) {
        config.ollamaUrl = DEFAULT_OLLAMA_URL;
      }
      if (!config.ollamaModel) {
        config.ollamaModel = DEFAULT_OLLAMA_MODEL;
      }
      return config;
    }
  } catch (error) {
    console.error("Error reading config file:", error.message);
  }
  return {
    model: DEFAULT_MODEL,
    provider: "openrouter",
    ollamaUrl: DEFAULT_OLLAMA_URL,
    ollamaModel: DEFAULT_OLLAMA_MODEL
  };
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

module.exports = {
  loadConfig,
  saveConfig,
  configDir,
  configPath,
  DEFAULT_MODEL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_URL,
};
