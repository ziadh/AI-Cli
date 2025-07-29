const ora = require("ora");
const { promptUser } = require("./utils");
const { loadConfig, saveConfig, DEFAULT_MODEL, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL } = require("./config");
const { saveContext } = require("./context");

async function getAPIKey() {
  const config = loadConfig();

  if (config.apiKey) {
    return config.apiKey;
  }

  if (config.provider === "ollama") {
    // Ollama doesn't require an API key, but we should check if it's running
    try {
      const response = await fetch(`${config.ollamaUrl}/api/tags`);
      if (!response.ok) {
        console.log("⚠️  Ollama is not running. Please start Ollama first.");
        process.exit(1);
      }
      return null; // Ollama doesn't use API keys
    } catch (error) {
      console.log("⚠️  Ollama is not running. Please start Ollama first.");
      process.exit(1);
    }
  }

  console.log("\n🔧 First time setup required!");
  console.log("This CLI supports both OpenRouter and Ollama providers.");
  console.log("\nChoose your AI provider:");
  console.log("1. OpenRouter (cloud) - requires API key");
  console.log("2. Ollama (local) - requires Ollama to be running locally");

  const providerChoice = await promptUser("\nEnter your choice (1 or 2): ");

  if (providerChoice === "2") {
    // Setup Ollama
    config.provider = "ollama";
    if (saveConfig(config)) {
      console.log("✅ Provider set to Ollama!");
    }
    await setupOllama();
    return null;
  } else if (providerChoice !== "1") {
    console.log("Invalid choice. Defaulting to OpenRouter.");
  }

  console.log("\n📝 OpenRouter Setup:");
  console.log("You need to configure your OpenRouter API Key.");
  console.log("You can find this by going to https://openrouter.com. \n");

  const apiKey = await promptUser("Enter your OpenRouter API Key: ");

  if (!apiKey) {
    console.error("❌ OpenRouter API Key is required to use this CLI tool.");
    process.exit(1);
  }

  config.apiKey = apiKey;
  config.provider = "openrouter";
  if (saveConfig(config)) {
    console.log("✅ OpenRouter API Key saved successfully!\n");
  } else {
    console.error(
      "❌ Failed to save OpenRouter API Key. You'll need to enter it again next time.\n"
    );
  }

  return apiKey;
}

async function setupOllama() {
  const config = loadConfig();

  if (!config.ollamaModel || config.ollamaModel === DEFAULT_OLLAMA_MODEL) {
    console.log("\n🔧 Ollama setup required!");
    console.log("Please enter your preferred Ollama model ID.");
    console.log("Popular models: llama3.1, llama3, mistral, gemma2\n");

    const modelId = await promptUser("Enter your Ollama model ID (e.g., llama3.1): ");

    if (!modelId) {
      console.error("❌ Ollama model ID is required to use Ollama with this CLI tool.");
      process.exit(1);
    }

    config.ollamaModel = modelId;
    if (saveConfig(config)) {
      console.log(`✅ Ollama model ID "${modelId}" saved successfully!\n`);
    } else {
      console.error(
        "❌ Failed to save Ollama model ID. You'll need to enter it again next time.\n"
      );
    }
  }

  // Check if Ollama is running
  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`);
    if (!response.ok) {
      console.log("⚠️  Ollama is not running. Please start Ollama first.");
      process.exit(1);
    }
    console.log("✅ Ollama is running and ready!");
  } catch (error) {
    console.log("⚠️  Ollama is not running. Please start Ollama first.");
    process.exit(1);
  }
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

async function sendOllamaQuery(messages, useStreaming = true) {
  const config = loadConfig();
  const model = config.ollamaModel;

  // Ensure Ollama is set up
  await setupOllama();

  const spinner = ora(`Sending query to Ollama ${model}`).start();

  try {
    const response = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: useStreaming,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    let assistantResponse = '';

    if (useStreaming) {
      spinner.succeed(`Connected to Ollama ${model}! Streaming response...\n`);
      assistantResponse = await handleOllamaStreamingResponse(response);
    } else {
      const data = await response.json();
      spinner.succeed("Query sent successfully!");

      if (data.message && data.message.content) {
        assistantResponse = data.message.content;
        console.log("\n" + assistantResponse);
      } else {
        console.log("Response:", JSON.stringify(data, null, 2));
        return;
      }
    }

    return assistantResponse;
  } catch (error) {
    spinner.fail("Failed to send query to Ollama");
    console.error("Error:", error.message);
    throw error;
  }
}

async function handleOllamaStreamingResponse(response) {
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

        try {
          const parsed = JSON.parse(line);
          if (parsed.message && parsed.message.content) {
            const content = parsed.message.content;
            if (content) {
              process.stdout.write(content);
              fullResponse += content;
            }
          }
          if (parsed.done) {
            console.log('\n');
            return fullResponse;
          }
        } catch (parseError) {
          continue;
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

async function sendAIQueryWithContext(messages, contextName, useStreaming = true, modelOverride = null) {
  try {
    const config = loadConfig();

    // Determine which provider to use
    const useOllama = config.provider === "ollama" && !modelOverride;
    const model = modelOverride || (useOllama ? config.ollamaModel : config.model) || (useOllama ? DEFAULT_OLLAMA_MODEL : DEFAULT_MODEL);

    let assistantResponse = '';

    if (useOllama) {
      // Use Ollama
      assistantResponse = await sendOllamaQuery(messages, useStreaming);
    } else {
      // Use OpenRouter
      const apiKey = await getAPIKey();
      const spinner = ora(`Sending query to ${model} (context: "${contextName}")`).start();

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "AI CLI",
          "X-Title": "AI CLI",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: useStreaming,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      if (useStreaming) {
        spinner.succeed(`Connected to ${model} (context: "${contextName}")! Streaming response...\n`);
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

async function sendAIQuery(query, useStreaming = true, modelOverride = null) {
  const messages = [{ role: "user", content: query }];
  await sendAIQueryWithContext(messages, "temp", useStreaming, modelOverride);
}

module.exports = {
  getAPIKey,
  sendAIQueryWithContext,
  sendAIQuery,
};
