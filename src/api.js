const ora = require("ora");
const { promptUser } = require("./utils");
const { loadConfig, saveConfig, DEFAULT_MODEL } = require("./config");
const { saveContext } = require("./context");

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

async function sendAIQueryWithContext(messages, contextName, useStreaming = true, modelOverride = null) {
  try {
    const apiKey = await getAPIKey();
    const config = loadConfig();
    const model = modelOverride || config.model || DEFAULT_MODEL;
    
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

    let assistantResponse = '';

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
