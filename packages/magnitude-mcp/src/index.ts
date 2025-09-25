#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { chromium, BrowserContext } from 'patchright';
import { WebAction, WebHarness } from 'magnitude-core';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

// Configuration from environment variables
const config = {
    profileDir: process.env.MAGNITUDE_MCP_PROFILE_DIR || path.join(homedir(), '.magnitude', 'profiles', 'default'),
    stealth: !!process.env.MAGNITUDE_MCP_STEALTH,  // Enable stealth mode (shows warning banner but better anti-detection)
    viewportWidth: parseInt(process.env.MAGNITUDE_MCP_VIEWPORT_WIDTH || '1024'),
    viewportHeight: parseInt(process.env.MAGNITUDE_MCP_VIEWPORT_HEIGHT || '768'),
};

// Ensure profile directory exists
if (!fs.existsSync(config.profileDir)) {
    fs.mkdirSync(config.profileDir, { recursive: true });
}

console.log(`Using browser profile directory: ${config.profileDir}`);
if (config.stealth) {
    console.log('Stealth mode enabled - warning banner may appear but anti-detection is improved');
}

// Action schemas with discriminated union
const ClickActionSchema = z.object({
    type: z.literal('click'),
    x: z.number(),
    y: z.number()
});

const RightClickActionSchema = z.object({
    type: z.literal('right_click'),
    x: z.number(),
    y: z.number()
});

const DoubleClickActionSchema = z.object({
    type: z.literal('double_click'),
    x: z.number(),
    y: z.number()
});

const TypeActionSchema = z.object({
    type: z.literal('type'),
    x: z.number(),
    y: z.number(),
    content: z.string()
});

const DragActionSchema = z.object({
    type: z.literal('drag'),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number()
});

const ScrollActionSchema = z.object({
    type: z.literal('scroll'),
    x: z.number(),
    y: z.number(),
    deltaX: z.number(),
    deltaY: z.number()
});

const SwitchTabActionSchema = z.object({
    type: z.literal('switch_tab'),
    index: z.number()
});

const NewTabActionSchema = z.object({
    type: z.literal('new_tab'),
    url: z.string().optional()
});

const NavigateActionSchema = z.object({
    type: z.literal('navigate'),
    url: z.string()
});

const KeyPressActionSchema = z.object({
    type: z.literal('keypress'),
    key: z.enum(['Enter', 'Tab', 'Backspace'])
});

const ActionSchema = z.discriminatedUnion('type', [
    ClickActionSchema,
    RightClickActionSchema,
    DoubleClickActionSchema,
    TypeActionSchema,
    DragActionSchema,
    ScrollActionSchema,
    SwitchTabActionSchema,
    NewTabActionSchema,
    NavigateActionSchema,
    KeyPressActionSchema
]);

const ConnectBrowserSchema = z.object({
    url: z.string().optional()
});

const ActSchema = z.object({
    actions: z.array(ActionSchema)
});

type Action = z.infer<typeof ActionSchema>;

// Global browser state
let context: BrowserContext | null = null;
let harness: WebHarness | null = null;

// Utility to get current state (tabs + screenshot)
async function getCurrentState() {
    if (!harness) {
        throw new Error('No browser connected');
    }

    const tabState = await harness.retrieveTabState();
    const screenshot = await harness.screenshot();
    const base64 = await screenshot.toBase64();

    return {
        tabs: tabState,
        screenshot: base64
    };
}

const server = new Server(
    {
        name: 'magnitude-mcp',
        version: '0.1.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'open_browser',
                description: 'Open browser with persistent profile that you can control.',
                inputSchema: zodToJsonSchema(ConnectBrowserSchema),
            },
            {
                name: 'act',
                description: 'Perform actions in the browser. Combine multiple actions at the same time for efficiency. The blue cursor represents the last position you interacted with, however it may sometimes be missing or misplaced even after a successful interaction.',
                inputSchema: zodToJsonSchema(ActSchema),
            },
            {
                name: 'screenshot',
                description: 'Get current browser state (tabs and screenshot)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
        ],
    };
});

// Call tools handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'open_browser': {
                const parsed = ConnectBrowserSchema.parse(args || {});

                // Close existing
                if (context) {
                    await harness?.stop();
                    await context.close();
                    context = null;
                    harness = null;
                }

                // Clear crash state from Chrome preferences to prevent the session restore popup
                const prefsPath = path.join(config.profileDir, 'Default', 'Preferences');
                if (fs.existsSync(prefsPath)) {
                    try {
                        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
                        if (prefs.profile && prefs.profile.exit_type) {
                            prefs.profile.exit_type = 'Normal';
                            prefs.profile.exited_cleanly = true;
                        }
                        fs.writeFileSync(prefsPath, JSON.stringify(prefs));
                    } catch (e) {
                        // Ignore errors, preferences might not exist yet
                    }
                }

                // Launch browser with default profile
                const launchOptions: any = {
                    channel: "chrome",
                    headless: false,
                    viewport: { width: config.viewportWidth, height: config.viewportHeight },
                    deviceScaleFactor: process.platform === 'darwin' ? 2 : 1,
                    args: [
                        '--disable-infobars',  // Hide "Chrome is controlled" banner
                        '--no-first-run',  // Skip first run experience
                        '--disable-session-crashed-bubble',  // Disable crash restore popup
                        '--disable-features=InfiniteSessionRestore',  // Disable session restore
                        '--no-default-browser-check',  // Skip default browser check
                    ]
                };

                // If stealth mode is NOT enabled, remove the flags that cause warning banner
                if (!config.stealth) {
                    launchOptions.ignoreDefaultArgs = ['--no-sandbox', '--disable-blink-features=AutomationControlled'];
                }

                context = await chromium.launchPersistentContext(config.profileDir, launchOptions);

                // Create harness
                // Use Claude's virtual screen dimensions since we do not know that model might use the MCP server
                harness = new WebHarness(context, {
                    virtualScreenDimensions: { width: 1024, height: 768 },
                    switchTabsOnActivity: true // detect user activity in the browser to try and keep active tab in sync
                });
                await harness.start();

                // Navigate to provided URL or Google by default
                const startUrl = parsed.url || 'https://www.google.com';
                await harness.navigate(startUrl);

                // Get current state
                const state = await getCurrentState();

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Browser opened\n\nTabs:\n${JSON.stringify(state.tabs, null, 2)}`
                        },
                        {
                            type: 'image',
                            data: state.screenshot,
                            mimeType: 'image/png'
                        }
                    ]
                };
            }

            case 'act': {
                if (!harness) {
                    throw new Error('No browser connected. Use connect_browser first.');
                }

                const parsed = ActSchema.parse(args);

                // Execute actions
                for (const action of parsed.actions) {
                    switch (action.type) {
                        case 'click':
                            await harness.click({ x: action.x, y: action.y });
                            break;
                        case 'right_click':
                            await harness.rightClick({ x: action.x, y: action.y });
                            break;
                        case 'double_click':
                            await harness.doubleClick({ x: action.x, y: action.y });
                            break;
                        case 'type':
                            await harness.clickAndType({ x: action.x, y: action.y, content: action.content });
                            break;
                        case 'drag':
                            await harness.drag({ x1: action.x1, y1: action.y1, x2: action.x2, y2: action.y2 });
                            break;
                        case 'scroll':
                            await harness.scroll({ x: action.x, y: action.y, deltaX: action.deltaX, deltaY: action.deltaY });
                            break;
                        case 'switch_tab':
                            await harness.switchTab({ index: action.index });
                            break;
                        case 'new_tab':
                            await harness.newTab();
                            if (action.url) {
                                await harness.navigate(action.url);
                            }
                            break;
                        case 'navigate':
                            await harness.navigate(action.url);
                            break;
                        case 'keypress':
                            if (action.key.toLowerCase() === 'enter') await harness.enter();
                            else if (action.key.toLowerCase() === 'tab') await harness.tab();
                            else if (action.key.toLowerCase() === 'backspace') await harness.backspace();
                            break;
                        default:
                            throw new Error(`Unknown action type: ${(action as any).type}`);
                    }
                }

                // Get current state
                const state = await getCurrentState();

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Actions executed: ${parsed.actions.length}\n\nCurrent tabs:\n${JSON.stringify(state.tabs, null, 2)}`
                        },
                        {
                            type: 'image',
                            data: state.screenshot,
                            mimeType: 'image/png'
                        }
                    ]
                };
            }

            case 'screenshot': {
                const state = await getCurrentState();
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Current tabs:\n${JSON.stringify(state.tabs, null, 2)}`
                        },
                        {
                            type: 'image',
                            data: state.screenshot,
                            mimeType: 'image/png'
                        }
                    ]
                };
            }

            default:
                return {
                    content: [{
                        type: 'text',
                        text: `Unknown tool: ${name}`
                    }]
                };
        }
    } catch (error) {
        console.error(`Tool error in ${name}:`, error);
        return {
            content: [{
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }]
        };
    }
});


// Cleanup on exit
process.on('SIGINT', async () => {
    if (harness) await harness.stop();
    if (context) await context.close();
    await server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (harness) await harness.stop();
    if (context) await context.close();
    await server.close();
    process.exit(0);
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
    console.error('Magnitude MCP Browser Server running');
});