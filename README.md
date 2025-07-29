# AI CLI Tool

A powerful command-line interface for interacting with AI models through OpenRouter or Ollama, featuring smart context management, streaming responses, and flexible model selection.

## 🚀 Features

- Smart Context Management - Maintain conversation history across sessions
- Streaming Responses - Real-time AI responses as they're generated
- Multiple AI Models - Support for OpenAI, Anthropic, Google, Meta, and more
- Quick Continuation - Use `+` for rapid follow-up queries
- Flexible Configuration - Persistent settings for API keys and default models
- Context Organization - Named conversations for different topics

## 📦 Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Either:
  - OpenRouter API key ([Get one here](https://openrouter.ai/keys)) OR
  - Ollama running locally ([Install Ollama](https://ollama.com/))

### Install Dependencies

```bash
npm install commander ora@5
```

### Setup

1. Save the script as `ai-cli.js`
2. Make it executable:

```bash
chmod +x ai-cli.js
```

3. (Optional) Link globally for system-wide access:

```bash
npm link
```

## 🔧 Configuration

### First Time Setup

On first run, you'll be prompted to enter your OpenRouter API key:

```bash
node ai-cli.js "Hello world"
```

### Manual Configuration

```bash
# Set API key
node ai-cli.js config --set-api-key "your-api-key-here"

# Set default model
node ai-cli.js config --set-model "anthropic/claude-3.5-sonnet"

# View current configuration
node ai-cli.js config --show

# Reset all configuration
node ai-cli.js config --reset
```

### Ollama Support

The CLI now supports Ollama for local AI inference. You can switch between OpenRouter (cloud) and Ollama (local) providers.

```bash
# Switch to Ollama provider
ai config --set-provider ollama

# Set Ollama model (must be pulled first with `ollama pull`)
ai config --set-ollama-model llama3.1

# Set custom Ollama URL (if running on different port/machine)
ai config --set-ollama-url http://localhost:11434

# Switch back to OpenRouter
ai config --set-provider openrouter
```

When using Ollama for the first time, you'll be prompted to enter your preferred model ID. Popular Ollama models include:

- `llama3.1` - Latest Llama 3.1 model
- `llama3` - Original Llama 3 model
- `mistral` - Mistral 7B model
- `gemma2` - Google's Gemma 2 model

Make sure to pull the model first:

```bash
ollama pull llama3.1
```

### First Time Setup with Ollama

On first run with Ollama selected, you'll be prompted to enter your preferred model ID:

```bash
node ai-cli.js "Hello world"
# Choose provider: 2 (Ollama)
# Enter model ID: llama3.1
```

## 🎯 Usage

### Basic Queries

```bash
# Single query (no context saved)
ai "What is machine learning?"

# With specific model
ai "Explain quantum physics" --model "openai/gpt-4o"

# Disable streaming
ai "Quick answer please" --no-stream
```

### Context Management

```bash
# Start a conversation
ai chat "Let's discuss React development"

# Continue in same context
ai chat "What about hooks?" --context default

# Use named contexts
ai chat "Help me with Python" --context python-help
ai chat "More about decorators" --context python-help

# Start fresh conversation
ai chat "New topic" --new
```

### Quick Continuation

```bash
# Start a conversation
ai chat "Explain JavaScript closures"

# Quick follow-ups with +
ai + "Show me an example"
ai + "What are common use cases?"
ai + "Any performance considerations?"
```

### Context Management Commands

```bash
# List all contexts
ai context --list

# Show context details
ai context --show python-help

# Clear context messages (keep context name)
ai context --clear python-help

# Delete context completely
ai context --delete old-context
```

## 🤖 Supported Models

### Popular Models

- `openai/gpt-4o` - GPT-4 Omni (default)
- `openai/gpt-4o-mini` - GPT-4 Omni Mini
- `anthropic/claude-3.5-sonnet` - Claude 3.5 Sonnet
- `anthropic/claude-3-haiku` - Claude 3 Haiku
- `google/gemini-pro-1.5` - Gemini Pro 1.5
- `meta-llama/llama-3.1-70b-instruct` - Llama 3.1 70B

### Model Selection

```bash
# Set default model
ai config --set-model "anthropic/claude-3.5-sonnet"

# Override for single query
ai "Creative writing task" --model "anthropic/claude-3.5-sonnet"

# Override in conversations
ai chat "Technical discussion" --model "openai/gpt-4o"
ai + "Follow up question" --model "anthropic/claude-3-haiku"
```

## 📁 File Structure

The tool creates a configuration directory at `~/.ai-cli/`:

```
~/.ai-cli/
├── config.json          # API key and default model
└── contexts/            # Conversation contexts
    ├── default.json     # Default conversation context
    ├── python-help.json # Named context example
    └── ...
```

## 🔍 Command Reference

### Main Commands

| Command             | Description                    | Example                         |
| :------------------ | :----------------------------- | :------------------------------ |
| `ai [query]`        | Single query                   | `ai "Hello world"`              |
| `ai chat <message>` | Start/continue conversation    | `ai chat "Let's talk about AI"` |
| `ai + <message>`    | Quick continue default context | `ai + "Tell me more"`           |
| `ai config`         | Manage configuration           | `ai config --show`              |
| `ai context`        | Manage contexts                | `ai context --list`             |

### Options

| Option             | Description              | Available On       |
| :----------------- | :----------------------- | :----------------- |
| `--model <model>`  | Override default model   | All query commands |
| `--no-stream`      | Disable streaming        | All query commands |
| `--context <name>` | Use named context        | `chat` command     |
| `--new`            | Start fresh conversation | `chat` command     |

### Configuration Options

| Option                       | Description                            |
| :--------------------------- | :------------------------------------- |
| `--set-api-key <key>`        | Set OpenRouter API key                 |
| `--set-model <model>`        | Set default model                      |
| `--set-provider <provider>`  | Set AI provider (openrouter or ollama) |
| `--set-ollama-model <model>` | Set Ollama model ID                    |
| `--set-ollama-url <url>`     | Set Ollama base URL                    |
| `--show`                     | Show current configuration             |
| `--reset`                    | Reset all configuration                |

### Context Options

| Option            | Description            |
| :---------------- | :--------------------- |
| `--list`          | List all contexts      |
| `--show <name>`   | Show context details   |
| `--clear <name>`  | Clear context messages |
| `--delete <name>` | Delete context         |

## 💡 Tips & Best Practices

### Context Organization

- Use descriptive context names: `python-help`, `project-planning`, `creative-writing`
- Clear old contexts regularly to save space
- Use `--new` flag when switching topics completely

### Model Selection

- **GPT-4o**: Best for complex reasoning and analysis
- **Claude 3.5 Sonnet**: Excellent for creative writing and coding
- **GPT-4o Mini**: Faster and cheaper for simple tasks
- **Claude 3 Haiku**: Very fast for quick questions

### Performance Tips

- Use `--no-stream` for automated scripts
- Smaller models (`mini`, `haiku`) are faster and cheaper
- Clear contexts periodically to reduce token usage

## 🛠️ Troubleshooting

### Common Issues

- **"ora is not a function" error**:
  ```bash
  npm uninstall ora
  npm install ora@5
  ```
- **API key not working**:
  ```bash
  ai config --show  # Verify key is set
  ai config --set-api-key "your-new-key"
  ```
- **Context not found**:
  ```bash
  ai context --list  # Check available contexts
  ai chat "new message" --context "correct-name"
  ```
- **Model not supported**:
  - Check OpenRouter models for available models
  - Ensure you have credits in your OpenRouter account
  - Try a different model: `ai config --set-model "openai/gpt-4o"`

### Error Messages

- `HTTP 401`: Invalid API key
- `HTTP 402`: Insufficient credits
- `HTTP 429`: Rate limit exceeded
- `HTTP 404`: Model not found

## 🔐 Security

- API keys are stored locally in `~/.ai-cli/config.json`
- No data is sent to third parties except OpenRouter
- Conversations are stored locally in plain text
- Use `ai config --reset` to clear all local data

## 📄 License

MIT License - feel free to modify and distribute.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

- OpenRouter Issues: OpenRouter Support
- Model-specific Issues: Check individual model documentation
- CLI Issues: Create an issue in this repository

## 🔄 Changelog

### v1.0.0

- Initial release
- Basic query functionality
- Context management
- Streaming responses
- Model configuration
- Quick continuation with `+`

---

Made with ❤️ for the AI community
