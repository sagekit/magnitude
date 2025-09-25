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
import { WebHarness } from 'magnitude-core';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

// Profile management
const profilesDir = path.join(homedir(), '.magnitude', 'profiles');
if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
}

// Action schemas with discriminated union
const ClickActionSchema = z.object({
    type: z.literal('click'),
    x: z.number(),
    y: z.number()
});

const TypeActionSchema = z.object({
    type: z.literal('type'),
    x: z.number(),
    y: z.number(),
    content: z.string()
});

const ScrollActionSchema = z.object({
    type: z.literal('scroll'),
    x: z.number(),
    y: z.number(),
    deltaX: z.number(),
    deltaY: z.number()
});

const TabActionSchema = z.object({
    type: z.literal('tab'),
    index: z.number()
});

const NavigateActionSchema = z.object({
    type: z.literal('navigate'),
    url: z.string()
});

const ActionSchema = z.discriminatedUnion('type', [
    ClickActionSchema,
    TypeActionSchema,
    ScrollActionSchema,
    TabActionSchema,
    NavigateActionSchema
]);

const ConnectBrowserSchema = z.object({
    profile: z.string().nullable().optional()
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
                name: 'list_profiles',
                description: 'List all available browser profiles. Only necessary if the user wants it, otherwise use default.',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'connect_browser',
                description: 'Connect to browser with profile (null for ephemeral)',
                inputSchema: zodToJsonSchema(ConnectBrowserSchema),
            },
            {
                name: 'act',
                description: 'Perform actions in the browser',
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
            case 'list_profiles': {
                const profiles = fs.readdirSync(profilesDir, { withFileTypes: true })
                    .filter(d => d.isDirectory())
                    .map(d => d.name);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(profiles.length > 0 ? profiles : ['default'])
                    }]
                };
            }

            case 'connect_browser': {
                const parsed = ConnectBrowserSchema.parse(args || {});

                // Close existing
                if (context) {
                    await harness?.stop();
                    await context.close();
                    context = null;
                    harness = null;
                }

                // Get profile path
                const profileName = parsed.profile || null;
                const userDataDir = profileName
                    ? path.join(profilesDir, profileName)
                    : "";

                // Launch browser
                context = await chromium.launchPersistentContext(userDataDir, {
                    channel: "chrome",
                    headless: false,
                    viewport: { width: 1024, height: 768 },
                    deviceScaleFactor: process.platform === 'darwin' ? 2 : 1
                });

                // Create harness
                // Use Claude's virtual screen dimensions since we do not know that model might use the MCP server
                harness = new WebHarness(context, { virtualScreenDimensions: { width: 1024, height: 768 }});
                await harness.start();

                // Navigate to Google by default
                await harness.navigate('https://www.google.com');

                // Get current state
                const state = await getCurrentState();

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Connected to browser${profileName ? ` with profile: ${profileName}` : ' (ephemeral)'}\n\nTabs:\n${JSON.stringify(state.tabs, null, 2)}`
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
                    if (action.type === 'navigate') {
                        // Navigate has its own method
                        await harness.navigate(action.url);
                    } else {
                        // Convert and execute other actions
                        const webAction = convertToWebAction(action);
                        await harness.executeAction(webAction);
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

function convertToWebAction(action: Action): any {
    switch (action.type) {
        case 'click':
            return { variant: 'click', x: action.x, y: action.y };
        case 'type':
            return { variant: 'type', x: action.x, y: action.y, content: action.content };
        case 'scroll':
            return { variant: 'scroll', x: action.x, y: action.y, deltaX: action.deltaX, deltaY: action.deltaY };
        case 'tab':
            return { variant: 'tab', index: action.index };
        default:
            throw new Error(`Unknown action type: ${(action as any).type}`);
    }
}

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