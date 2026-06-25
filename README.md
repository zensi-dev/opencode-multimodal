# opencode-multimodal

Give OpenCode models multimodal fallback support, even when the active model cannot read attachments itself.

## Install

```bash
opencode plugin opencode-multimodal --global
```

Restart OpenCode, then run:

```text
/multimodal
```

Pick fallback models for images, PDFs, and audio. The plugin stays inactive until you configure at least one fallback chain.

## What It Does

`opencode-multimodal` lets a text-only or modality-limited model work with images, PDFs, and audio by routing unsupported attachments to a configured auxiliary model. The auxiliary model analyzes the attachment, the plugin replaces the original attachment with a structured text description, and your active OpenCode agent continues with the extracted context.

Keep using your preferred coding model while a separate multimodal model handles attachment analysis in the background.

```text
You attach a screenshot while using a text-only model
  -> opencode-multimodal detects that the active model cannot read images
  -> your configured fallback model analyzes the screenshot
  -> the image is replaced with structured text
  -> your active model receives the extracted information
```

## Why Use It

- Use strong text-first coding models with screenshots, PDFs, and audio files.
- Configure everything from OpenCode with `/multimodal`.
- Reuse providers already authenticated through `/connect` or `opencode auth login`.
- Choose different fallback models for image, PDF, and audio workflows.
- Keep behavior safe: no fallback configured means no behavior change.

## Features

- Adds multimodal fallback support for image, PDF, and audio attachments.
- Detects when the active OpenCode model lacks the required input capability.
- Uses your existing OpenCode providers and credentials from `/connect`, `auth.json`, provider config, or environment variables.
- Provides a `/multimodal` configuration UI inside OpenCode.
- Lets you choose fallback models separately for each modality.
- Supports custom providers configured in OpenCode when they declare model metadata and use a bundled provider package.
- Supports ordered fallback chains, so the first available credentialed model is used.
- Replaces unsupported attachments with text extracted by the auxiliary model before OpenCode's provider request is built.
- Caches attachment analysis within a session to avoid repeated fallback calls.
- Fails safely: if no fallback is configured, no key is available, or analysis fails, the original attachment is left untouched.

## How It Works

The plugin runs in OpenCode's `experimental.chat.messages.transform` hook. This hook runs before OpenCode replaces unsupported attachments with its default error text, so `opencode-multimodal` can inject useful context at the right point in the message pipeline.

## Requirements

- OpenCode `>= 1.17.0`
- At least one authenticated provider with a model that supports the attachment type you want to handle
- Bun-managed OpenCode plugin installation, which OpenCode handles automatically for npm plugins

## Manual Configuration

The plugin has two OpenCode targets:

- Server target: transforms chat messages and performs fallback analysis.
- TUI target: registers the `/multimodal` configuration UI.

The `opencode plugin` command should configure both targets automatically. If you prefer to configure it manually, add the package to both config files.

Server config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-multimodal"],
}
```

TUI config:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-multimodal"]
}
```

Global config paths:

| Purpose       | Path                               |
| ------------- | ---------------------------------- |
| Server config | `~/.config/opencode/opencode.json` |
| TUI config    | `~/.config/opencode/tui.json`      |

Project-level config is also supported with `.opencode/opencode.json` and `.opencode/tui.json`.

## Configuration UI

Run `/multimodal` inside OpenCode to configure the plugin.

The UI lets you configure:

- Master enable or disable switch.
- Per-modality fallback chains for image, PDF, and audio.
- Provider and model selection from OpenCode's local models database and custom provider config.
- Credential-aware model suggestions.
- Per-modality analysis prompts.
- Concurrency, timeout, cache TTL, and missing-fallback toast behavior.

Fresh installs are safe by default. No fallback models are configured automatically, so the plugin does nothing until you opt in from the UI.

## Authentication

The plugin reuses the providers you already use with OpenCode. For each fallback provider, keys are resolved in this order:

1. OpenCode `auth.json`, usually populated by `/connect` or `opencode auth login`.
2. OpenCode provider config, `provider.<id>.options.apiKey`.
3. Environment variables declared by OpenCode's models database, such as `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.

Recommended setup:

```text
1. Run /connect in OpenCode.
2. Authenticate the provider you want to use for fallback analysis.
3. Run /multimodal.
4. Choose fallback models for the modalities you care about.
```

The UI prioritizes credentialed providers so you can quickly select models that are ready to use.

## Custom Providers

Custom providers declared in OpenCode config are available in `/multimodal` when they include model metadata. The provider's `npm` package must be one of the packages bundled by this plugin. If `npm` is omitted for a custom provider, the plugin defaults to `@ai-sdk/openai-compatible`.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "my-gateway": {
      "name": "My Gateway",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://gateway.example.com/v1",
        "apiKey": "sk-...",
      },
      "models": {
        "gpt-4o": {
          "name": "GPT-4o via Gateway",
          "modalities": {
            "input": ["text", "image", "pdf", "audio"],
            "output": ["text"],
          },
          "limit": {
            "context": 128000,
            "output": 4096,
          },
        },
      },
    },
  },
}
```

The `modalities.input` list controls where the model appears in `/multimodal`. For example, a model with `"image"` appears in the image fallback picker.

Supported custom provider packages are the provider packages listed in `package.json` dependencies, including Anthropic, OpenAI, OpenAI-compatible, Google, Google Vertex, Mistral, Cohere, Groq, xAI, Amazon Bedrock, Azure, DeepInfra, Fireworks, TogetherAI, Perplexity, and OpenRouter.

## Supported Modalities

| Modality | Status      | Notes                                                                                    |
| -------- | ----------- | ---------------------------------------------------------------------------------------- |
| Image    | Supported   | Screenshots, diagrams, UI mockups, photos, and other `image/*` attachments.              |
| PDF      | Supported   | Documents with `application/pdf` MIME type.                                              |
| Audio    | Supported   | Audio attachments with `audio/*` MIME types.                                             |
| Video    | Not enabled | Video is reserved for future support and is not part of the active transform path today. |

## Options

Most settings live in the `/multimodal` UI. Optional plugin-level diagnostics can be passed in config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["opencode-multimodal", { "log_level": "debug" }]],
}
```

If you use manual config and need a custom config file location, set the same `config_path` option on both the server and TUI targets.

| Option        | Type                                     | Default       | Description                             |
| ------------- | ---------------------------------------- | ------------- | --------------------------------------- |
| `log_level`   | `"debug" \| "info" \| "warn" \| "error"` | `"info"`      | Server-side log verbosity.              |
| `config_path` | `string`                                 | Auto-detected | Override the plugin settings file path. |

Plugin settings are stored outside your project by default:

| OS      | Path                                                              |
| ------- | ----------------------------------------------------------------- |
| Linux   | `~/.local/share/opencode/opencode-multimodal.json`                |
| macOS   | `~/Library/Application Support/opencode/opencode-multimodal.json` |
| Windows | `%LOCALAPPDATA%\opencode\opencode-multimodal.json`                |

## Architecture

`opencode-multimodal` is a dual-target OpenCode plugin.

| Target | Entry point                  | Purpose                                                                                                      |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Server | `opencode-multimodal/server` | Registers backend hooks, detects unsupported attachments, calls fallback models, and rewrites message parts. |
| TUI    | `opencode-multimodal/tui`    | Registers `/multimodal` and renders the configuration UI.                                                    |

Shared logic lives in `src/shared`, including config storage, auth lookup, model metadata, provider package mapping, prompts, and utility functions.

Runtime model capability data comes from OpenCode's local `models.dev` cache at `~/.cache/opencode/models.json` on Linux, with equivalent cache locations on macOS and Windows. Custom provider models declared in OpenCode config are merged into that catalog before the server and TUI make capability or picker decisions.

## Limitations

- The active model is never changed. The plugin only replaces unsupported attachments with extracted text.
- A fallback chain must be configured before any modality is transformed.
- The fallback provider must have a credential available to OpenCode.
- Only provider packages bundled with this plugin can be used for fallback calls.
- Video is not enabled in the current release.
- If fallback analysis fails, OpenCode's normal unsupported-attachment behavior applies.

## Development

This project uses Bun.

```bash
bun install
bun run build
bun run typecheck
bun run test
bun run format
```

For local development, this repository includes `.opencode/opencode.json` and `.opencode/tui.json` that load the package root with `"plugin": [".."]`. Run `bun run build`, restart OpenCode from the repository root, then use `/multimodal`.

## Release Checklist

```bash
bun install --frozen-lockfile
bun run format
bun run typecheck
bun run test
bun run build
bun publish --dry-run
bun publish --access public
```

## Contributing

Issues and pull requests are welcome. Please include reproduction steps for bugs and describe which OpenCode version, provider, model, modality, and operating system are involved.

## License

MIT
