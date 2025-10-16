import { type LLMClient } from '@/ai/types';
import { Agent, AgentOptions } from "@/agent";
import { BrowserConnector, BrowserConnectorOptions } from "@/connectors/browserConnector";
import { completeClaudeCodeAuthFlow } from './claudeCode';

function cleanNestedObject(obj: object): object {
    // Remove null/undefined key values entirely
    return Object.fromEntries(
        Object.entries(obj)
            // Filter out null/undefined values
            .filter(([_, value]) => value !== null && value !== undefined)
            // Process nested objects recursively
            .map(([key, value]) => [
                key,
                typeof value === 'object' ? cleanNestedObject(value) : value
            ])
    );
}

export async function convertToBamlClientOptions(client: LLMClient): Promise<Record<string, any>> {
    // extract options compatible with https://docs.boundaryml.com/ref/llm-client-providers/overview

    // Default to temperature 0.0
    // Some client options (e.g. azure) do not have a temperature setting
    const temp = 'temperature' in client.options ?
        (client.options.temperature ?? 0.0) : 0.0;

    let options: object;
    if (client.provider === 'claude-code') {
        // Special case - oauth with claude code max anthropic account
        const oauthToken = await completeClaudeCodeAuthFlow();
        options = {
            model: client.options.model,
            temperature: temp,
            headers: {
                'Authorization': `Bearer ${oauthToken}`,
                'anthropic-beta': 'oauth-2025-04-20' + (client.options.promptCaching ? ',prompt-caching-2024-07-31' : ''),
                // Overrides this header from being automatically derived from ANTHROPIC_API_KEY
                'X-API-Key': ''
            },
            ...(client.options.promptCaching ? { allowed_role_metadata: "all" } : {}),
        };
    } else if (client.provider === 'anthropic') {
        options = {
            api_key: client.options.apiKey,
            model: client.options.model,
            temperature: temp,
            ...(client.options.promptCaching ? {
                allowed_role_metadata: "all",
                headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' }
            } : {}),
        };
    } else if (client.provider === 'aws-bedrock') {
        options = {
            model_id: client.options.model,
            inference_configuration: {
                temperature: temp,
            }
        };
    } else if (client.provider === 'google-ai') {
        options = {
            base_url: client.options.baseUrl,
            model: client.options.model,
            api_key: client.options.apiKey,
            generationConfig: {
                temperature: temp,
                //thinking_budget: 0
            }
        };
    } else if (client.provider === 'vertex-ai') {
        options = {
            location: client.options.location,
            base_url: client.options.baseUrl,
            project_id: client.options.projectId,
            credentials: client.options.credentials,
            anthropic_version: client.options.anthropicVersion,
            model: client.options.model,
            // generationConfig: {
            //     temperature: temp,
            // }
        };
    } else if (client.provider === 'openai') {
        options = {
            api_key: client.options.apiKey,
            model: client.options.model,
            temperature: temp,
        };
    } else if (client.provider === 'openai-generic') {
        options = {
            base_url: client.options.baseUrl,
            api_key: client.options.apiKey,
            model: client.options.model,
            temperature: temp,
            headers: {
                "HTTP-Referer": "https://magnitude.run",
                "X-Title": "Magnitude",
                ...client.options.headers
            }
        };
    } else if (client.provider === 'azure-openai') {
        options = {
            resource_name: client.options.resourceName,
            deployment_id: client.options.deploymentId,
            api_version: client.options.apiVersion,
            api_key: client.options.apiKey
        };
    } else {
        throw new Error(`Invalid provider: ${(client as any).provider}`)
    }
    return cleanNestedObject(options);
}


export function tryDeriveUIGroundedClient(): LLMClient | null {
    if (process.env.ANTHROPIC_API_KEY) {
        return {
            provider: 'anthropic',
            options: {
                // TODO: do more testing on best claude model for visuals
                // model: 'claude-3-5-sonnet-20240620', // <- definitely not, pre computer use
                // model: 'claude-3-5-sonnet-20241022', // <- not great on rescaling res
                //model: 'claude-3-7-sonnet-latest', // <- underplans
                // model: 'claude-sonnet-4-20250514', // <- underplans, also supposedly worse at visual reasoning
                model: 'claude-haiku-4-5-20251001', // <- fast, cost-effective, good performance
                apiKey: process.env.ANTHROPIC_API_KEY
            }
        }
    } else {
        return null;
    }
}



export function isClaude(llm: LLMClient) {
    if ('model' in llm.options) {//if (llm.provider === 'anthropic' || llm.provider === 'aws-bedrock' || llm.provider === 'vertex-ai') {
        const model = llm.options.model;
        if (model.includes('claude')) return true;
    }
    return false;
}

const DEFAULT_BROWSER_AGENT_TEMP = 0.2;

export function buildDefaultBrowserAgentOptions(
    { agentOptions, browserOptions }: { agentOptions: AgentOptions, browserOptions: BrowserConnectorOptions }
): { agentOptions: AgentOptions, browserOptions: BrowserConnectorOptions } {
    /**
     * Given any provided options for agent or browser connector, fill out additional key fields using environment,
     * or any model-specific constraints (e.g. Claude needing 1024x768 virtual screen space)
     */
    const envLlm = tryDeriveUIGroundedClient();

    let llms: LLMClient[] = agentOptions.llm ? (Array.isArray(agentOptions.llm) ? agentOptions.llm : [agentOptions.llm]) : (envLlm ? [envLlm] : []);

    if (llms.length == 0) {
        throw new Error("No LLM configured or available from environment. Set environment variable ANTHROPIC_API_KEY and try again. See https://docs.magnitude.run/customizing/llm-configuration for details");
    }

    // Set reasonable temp if not provided
    let virtualScreenDimensions = null;
    for (const llm of llms) {
        let llmOptions: LLMClient['options'] = { temperature: DEFAULT_BROWSER_AGENT_TEMP, ...(llm?.options ?? {}) };
        //let modifiedLlm = {...llm, options: llmOptions as any }
        llm.options = llmOptions;

        if (isClaude(llm)) {
            // Claude only really works on 1024x768 screenshots
            // if any model is claude, use virtual screen dimensions
            virtualScreenDimensions = { width: 1024, height: 768 };
        }
    }

    return {
        agentOptions: {...agentOptions, llm: llms },
        browserOptions: {...browserOptions, virtualScreenDimensions: virtualScreenDimensions ?? undefined }
    };
}