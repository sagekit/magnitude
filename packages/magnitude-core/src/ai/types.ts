// export interface CheckResult {
//     passed: boolean,
//     confidence: number
// }

export type BrowserAgentRole= 'act' | 'extract' | 'query';
export const allBrowserAgentRoles: BrowserAgentRole[] = ['act', 'extract', 'query'] as const;

// Approximately mirrors https://docs.boundaryml.com/ref/llm-client-providers
export type LLMClient = (AnthropicClient | ClaudeCodeClient | BedrockClient | GoogleAIClient | GoogleVertexClient | OpenAIClient | OpenAIGenericClient | AzureOpenAIClient) &
    { roles?: BrowserAgentRole[] };

export interface AnthropicClient {
    provider: 'anthropic',
    options: {
        model: string,
        apiKey?: string,
        temperature?: number,
        promptCaching?: boolean,
    }   
}

export interface ClaudeCodeClient {
    // Claude code pro or max plan
    provider: 'claude-code',
    options: {
        model: string,
        temperature?: number,
        promptCaching?: boolean,
    }   
}

// See https://docs.boundaryml.com/ref/llm-client-providers/aws-bedrock for authentication details (use AWS_ env vars)
export interface BedrockClient {
    provider: 'aws-bedrock',
    options: {
        model: string,
        // passed to inference_configuration
        temperature?: number
    }   
}

// Google AI studio
// https://docs.boundaryml.com/ref/llm-client-providers/google-ai-gemini
export interface GoogleAIClient {
    provider: 'google-ai',
    options: {
        model: string,
        apiKey?: string // defaults to GOOGLE_API_KEY
        temperature?: number,
        baseUrl?: string // defaults to https://generativelanguage.googleapis.com/v1beta
    }
}

// See https://docs.boundaryml.com/ref/llm-client-providers/google-vertex for how this is authenticated
export interface GoogleVertexClient {
    provider: 'vertex-ai',
    options: {
        model: string,
        location?: string,
        baseUrl?: string,
        projectId?: string,
        credentials?: string | object,
        // Needed for anthropic models on vertex
        anthropicVersion?: string
        // passed to generationConfig
        temperature?: number,
    }
}

export interface OpenAIClient {
    provider: 'openai',
    options: {
        model: string,
        apiKey?: string,
        temperature?: number
    }
}

// https://docs.boundaryml.com/ref/llm-client-providers/open-ai-from-azure
export interface AzureOpenAIClient {
    provider: 'azure-openai',
    options: {
        resourceName: string,
        deploymentId: string,
        apiVersion: string,
        apiKey: string
    }
}

export interface OpenAIGenericClient {
    provider: 'openai-generic'
    options: {
        model: string,
        baseUrl: string,
        apiKey?: string,
        temperature?: number,
        headers?: Record<string, string>
    }
}



export interface LLMClientIdentifier {
    provider: string,
    model: string,
    //temperature: number
}

// incremental usage report
export interface ModelUsage {
    llm: LLMClientIdentifier,
    inputTokens: number,
    outputTokens: number,
    cacheWriteInputTokens?: number,
    cacheReadInputTokens?: number,
    inputCost?: number,
    outputCost?: number,
}
