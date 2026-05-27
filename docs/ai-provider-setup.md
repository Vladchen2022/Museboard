# Text Model Setup

Museboard uses the selected text model for random mind maps, node expansion, node descriptions, brief generation, and ComfyUI prompt rewriting.

Open `Settings -> Text Model` and choose one provider.

## LM Studio

Use this when you want a local model with the LM Studio server.

1. Start LM Studio.
2. Load a chat model.
3. Start the local server.
4. In Museboard, choose `LM Studio`.
5. Keep endpoint as `http://localhost:1234/v1`.
6. Enter the exact model name shown by LM Studio.

## OpenAI API

Use this when you want a hosted OpenAI model.

1. Create an API key in your OpenAI account.
2. Choose `OpenAI API`.
3. Keep endpoint as `https://api.openai.com/v1`.
4. Paste the API key.
5. Enter a model name available to your account.

API keys are stored only in local app preferences and are not saved into Museboard project files.

## DeepSeek API

Use this when you want DeepSeek's hosted OpenAI-compatible API.

1. Create a DeepSeek API key.
2. Choose `DeepSeek API`.
3. Keep endpoint as `https://api.deepseek.com`.
4. Paste the API key.
5. Use a current DeepSeek chat model name.

The default model field uses `deepseek-v4-flash`. If DeepSeek changes its model list, replace it with the model name shown in your DeepSeek account or documentation.

## Ollama

Use this when you want a local Ollama model.

1. Install Ollama.
2. Pull a chat model, for example `ollama pull qwen3:8b`.
3. Make sure Ollama is running.
4. Choose `Ollama`.
5. Keep endpoint as `http://localhost:11434`.
6. Enter the model name, for example `qwen3:8b`.

Museboard calls Ollama's native `/api/chat` endpoint.

## Custom OpenAI-Compatible Server

Use this for other local or remote servers that implement OpenAI-style chat completions.

1. Choose `OpenAI-compatible`.
2. Enter the base endpoint, usually ending in `/v1`.
3. Enter an API key only if your server requires one.
4. Enter the model name required by that server.

## Failure Checks

- Wrong endpoint: Museboard will show a connection failure.
- Wrong model name: the provider usually returns a model-not-found error.
- Missing API key: OpenAI and DeepSeek fail before the request is sent.
- Browser preview: OpenAI and DeepSeek calls are blocked in browser preview because API keys should not be exposed in client-side web code. Use the desktop app for hosted providers.
