#!/usr/bin/env node

const { program } = require("commander");
const ora = require("ora");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const configDir = path.join(require("os").homedir(), ".ai-cli");
const configPath = path.join(configDir, "config.json");
const contextDir = path.join(configDir, "contexts");

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

// Context management functions
async function saveContext(name, messages) {
  try {
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }
    
    const contextFile = path.join(contextDir, `${name}.json`);
    const context = {
      name,
      messages,
      createdAt: fs.existsSync(contextFile) 
        ? JSON.parse(fs.readFileSync(contextFile, 'utf8')).createdAt 
        : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(contextFile, JSON.stringify(context, null, 2));
    return true;
  } catch (error) {
    console.error("Error saving context:", error.message);
    return false;
  }
}

async function loadContext(name) {
  try {
    const contextFile = path.join(contextDir, `${name}.json`);
    if (fs.existsSync(contextFile)) {
      return JSON.parse(fs.readFileSync(contextFile, 'utf8'));
    }
  } catch (error) {
    console.error("Error loading context:", error.message);
  }
  return null;
}

async function listContexts() {
  try {
    if (!fs.existsSync(contextDir)) {
      return [];
    }
    
    const files = fs.readdirSync(contextDir).filter(f => f.endsWith('.json'));
    const contexts = [];
    
    for (const file of files) {
      const contextFile = path.join(contextDir, file);
      const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
      contexts.push({
        name: context.name,
        messageCount: context.messages.length,
        lastUpdated: context.updatedAt,
        created: context.createdAt
      });
    }
    
    return contexts.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
  } catch (error) {
    console.error("Error listing contexts:", error.message);
    return [];
  }
}

async function deleteContext(name) {
  try {
    const contextFile = path.join(contextDir, `${name}.json`);
    if (fs.existsSync(contextFile)) {
      fs.unlinkSync(contextFile);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting context:", error.message);
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
  let buffer = '';
  let fullResponse = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            console.log('\n');
            return fullResponse;
          }
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
              const content = parsed.choices[0].delta.content;
              if (content) {
                process.stdout.write(content);
                fullResponse += content;
              }
            }
          } catch (parseError) {
            continue;
          }
        }
      }
    }
  } catch (error) {
    console.error('\n❌ Error reading stream:', error.message);
  } finally {
    reader.releaseLock();
  }
  
  return fullResponse;
}

async function sendAIQueryWithContext(messages, contextName, useStreaming = true) {
  try {
    const apiKey = await getAPIKey();
    const spinner = ora(`Sending query to context "${contextName}"`).start();

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "AI CLI",
        "X-Title": "AI CLI",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: messages,
        stream: useStreaming,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    let assistantResponse = '';

    if (useStreaming) {
      spinner.succeed(`Connected to context "${contextName}"! Streaming response...\n`);
      assistantResponse = await handleStreamingResponse(response);
    } else {
      const data = await response.json();
      spinner.succeed("Query sent successfully!");
      
      if (data.choices && data.choices[0] && data.choices[0].message) {
        assistantResponse = data.choices[0].message.content;
        console.log("\n" + assistantResponse);
      } else {
        console.log("Response:", JSON.stringify(data, null, 2));
        return;
      }
    }

    // Save the conversation to context
    if (assistantResponse) {
      messages.push({ role: "assistant", content: assistantResponse });
      await saveContext(contextName, messages);
    }

  } catch (error) {
    console.error("❌ Failed to send query");
    console.error("Error:", error.message);
  }
}

async function sendAIQuery(query, useStreaming = true) {
  const messages = [{ role: "user", content: query }];
  await sendAIQueryWithContext(messages, "temp", useStreaming);
}

program
  .name("ai")
  .description("Unofficial CLI Tool for Open Router API with Smart Context Management")
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
      console.log("Contexts directory:", contextDir);
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
    await sendAIQueryWithContext(messages, options.context, useStreaming);
  });

// Quick continue with + command
program
  .command("+")
  .argument("<message>", "quickly continue the default conversation")
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
    await sendAIQueryWithContext(messages, "default", useStreaming);
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
  .option("--no-stream", "disable streaming")
  .action(async (query, options) => {
    if (query) {
      const useStreaming = options.stream !== false;
      await sendAIQuery(query, useStreaming);
    } else {
      program.help();
    }
  });

program.parse();