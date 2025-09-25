# Magnitude MCP

A Model Context Protocol (MCP) server that gives agents the ability to interact with the browser using the [Magnitude](https://github.com/sagekit/magnitude) framework.

## Requirements
The agent using this MCP must be **visually grounded**. Generally this means Claude (Sonnet 3.7/4, Opus 4) or Qwen VL series. See [docs](https://docs.magnitude.run/core-concepts/compatible-llms) for more info.

If the agent model is not Claude Sonnet 4, Sonnet 3.7, Opus 4, Qwen 2.5 VL, or Qwen 3 VL, it will probably not work with this MCP - because the vast majority of models cannot click accurately based on an image alone.

## Installation
```sh
npm i -g magnitude-mcp@latest
```

MCP Configuration:
```json
{
  "mcpServers": {
    "magnitude": {
      "command": "npx",
      "args": [
        "magnitude-mcp"
      ]
    }
  }
}
```

MCP configuration options (optional):
```json
{
  "mcpServers": {
    "magnitude": {
      "command": "npx",
      "args": [
        "magnitude-mcp"
      ],
      "env": {
        "MAGNITUDE_MCP_PROFILE_DIR": "/Users/myuser/.magnitude/profiles/default", 
        "MAGNITUDE_MCP_STEALTH": "true", 
        "MAGNITUDE_MCP_VIEWPORT_WIDTH": "1024",
        "MAGNITUDE_MCP_VIEWPORT_HEIGHT": "728"
      }
    }
  }
}
```
- `MAGNITUDE_MCP_PROFILE_DIR`: Stores cookies and local storage so that credentials can be re-used across agents using the MCP (default: `~/.magnitude/profiles/default`)
- `MAGNITUDE_MCP_STEALTH`: Add extra stealth settings to help with anti-bot detection (default: disabled)
- `MAGNITUDE_MCP_VIEWPORT_WIDTH`: Override viewport width (default: 1024)
- `MAGNITUDE_MCP_VIEWPORT_WIDTH`: Override viewport width (default: 728)

## Claude Code Installation
```sh
claude mcp add magnitude -- npx magnitude-mcp
```

## Cline Installation

Go to `MCP Servers -> Marketplace`, search for `Magnitude`, click `Install`

## Cursor Installation

1. Open Cursor Settings
2. Go to Features > MCP Servers
3. Click "+ Add new global MCP server"
4. Enter the following code: 
```json
{
  "mcpServers": {
    "magnitude": {
      "command": "npx",
      "args": [
        "magnitude-mcp"
      ]
    }
  }
}
```

## Windsurf Installation
Add this to your `./codeium/windsurf/model_config.json`:
```json
{
  "mcpServers": {
    "magnitude": {
      "command": "npx",
      "args": [
        "magnitude-mcp"
      ]
    }
  }
}
```