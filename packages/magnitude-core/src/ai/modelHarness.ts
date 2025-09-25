import { convertToBamlClientOptions } from "./util";
// Import ModularMemoryContext instead of old MemoryContext
import { b, AgentContext } from "@/ai/baml_client"; 
import { Image as BamlImage, Collector, ClientRegistry } from "@boundaryml/baml";
import { Action, ActionIntent, Intent } from "@/actions/types";
import { TestStepDefinition } from "@/types";
import { BamlAsyncClient } from "./baml_client/async_client";
import logger from "@/logger";
import { Logger } from 'pino';
import { BugDetectedFailure, MisalignmentFailure } from "@/common";
import { LLMClient, ModelUsage } from "@/ai/types";
import { TabState } from "@/web/tabs";
import { ActionDefinition } from "@/actions";
import TypeBuilder from "./baml_client/type_builder";
import { Schema, z } from 'zod';
import { convertActionDefinitionsToBaml, convertZodToBaml } from "@/actions/util";
import { convertActionDefinitionsForModel } from "@/actions/schemaConverter";
import { Image } from '@/memory/image';
import EventEmitter from "eventemitter3";
import { MultiMediaContentPart } from "@/memory/rendering";

interface ModelHarnessOptions {
    llm: LLMClient;
    //promptCaching?: boolean;
}

// export interface ModelUsage {
//     provider: string,
//     model: string,
//     inputTokens: number,
//     outputTokens: number,
//     numCalls: number
// }

export interface ModelHarnessEvents {
    'tokensUsed': (usage: ModelUsage) => {}
}

export class ModelHarness {
    /**
     * Strong reasoning agent for high level strategy and planning.
     */
    public readonly events: EventEmitter<ModelHarnessEvents> = new EventEmitter();
    private options: Required<ModelHarnessOptions>;
    private collector!: Collector;
    private cr!: ClientRegistry;
    private baml!: BamlAsyncClient;
    private logger: Logger;
    private prevTotalInputTokens: number = 0;
    private prevTotalOutputTokens: number = 0;

    constructor(options: ModelHarnessOptions) {
        this.options = {
            llm: options.llm,
            //promptCaching: options.promptCaching ?? false
        };

        this.logger = logger.child({ name: 'llm' });
    }

    async setup() {
        // Must be called after constructor
        this.collector = new Collector("macro");
        this.cr = new ClientRegistry();
        let bamlClientOptions = await convertToBamlClientOptions(this.options.llm);
        this.cr.addLlmClient(
            'Magnus', 
            this.options.llm.provider === 'claude-code' ? 'anthropic' : this.options.llm.provider,
            bamlClientOptions,
            'DefaultRetryPolicy'
        );
        this.cr.setPrimary('Magnus');

        this.baml = b.withOptions({ collector: this.collector, clientRegistry: this.cr });
    }

    describeModel(): string {
        return `${this.options.llm.provider}:${'model' in this.options.llm.options ? this.options.llm.options.model : 'unknown'}`;
    }

    private _reportUsage(): void {
        // console.log('this.collector.last', this.collector.last)
        // if (this.collector.last) console.log("calls:", this.collector.last.calls)//console.log("Response: ", this.collector.last.calls[-1].httpResponse);
        //console.log('last call:', this.collector.last?.calls.at(-1)?.httpResponse?.body.json());
        // Get tokens used since last call to reportUsage
        //console.log(this.collector.usage);

        let inputTokens: number = 0;
        let outputTokens: number = 0;
        let cacheWriteInputTokens: number = 0;
        let cacheReadInputTokens: number = 0;

        if (this.options.llm.provider === 'anthropic' || this.options.llm.provider === 'claude-code') {
            type AnthropicUsage = { input_tokens: number, cache_creation_input_tokens: number, cache_read_input_tokens: number, output_tokens: number, service_tier: string };
            const usage = this.collector.last?.calls.at(-1)?.httpResponse?.body.json().usage as AnthropicUsage;
            //console.log("Usage from Anthropic:", usage);
            if (!usage) {
                // Sometimes apparently this happens? Happened once after extract for example
                logger.warn("No usage returned from Anthropic provider, cached cost may be inaccurate");
                inputTokens = (this.collector.usage.inputTokens ?? 0) - this.prevTotalInputTokens;
                outputTokens = (this.collector.usage.outputTokens ?? 0) - this.prevTotalOutputTokens;
            } else {
                inputTokens = usage.input_tokens;
                outputTokens = usage.output_tokens;
                cacheWriteInputTokens = usage.cache_creation_input_tokens;
                cacheReadInputTokens = usage.cache_read_input_tokens;
            }
            
        } else {
            inputTokens = (this.collector.usage.inputTokens ?? 0) - this.prevTotalInputTokens;
            outputTokens = (this.collector.usage.outputTokens ?? 0) - this.prevTotalOutputTokens;
        }

        const model = (this.options.llm.options as any).model ?? 'unknown';

        // Get cost if known
        const knownCostMap: Record<string, { inputTokens: number, outputTokens: number, cacheWriteInputTokens?: number, cacheReadInputTokens?: number }> = {
            // TODO: track cached savings on Gemini
            'gemini-2.5-pro': { inputTokens: 1.25, outputTokens: 10.0 },
            'gemini-2.5-flash': { inputTokens: 0.30, outputTokens: 2.50 },
            'gemini-2.5-flash-lite': { inputTokens: 0.10, outputTokens: 0.40 },
            'claude-3.5-sonnet': { inputTokens: 3.00, outputTokens: 15.00, cacheWriteInputTokens: 3.75, cacheReadInputTokens: 0.30 },
            'claude-3.7-sonnet': { inputTokens: 3.00, outputTokens: 15.00, cacheWriteInputTokens: 3.75, cacheReadInputTokens: 0.30 },
            'claude-sonnet-4': { inputTokens: 3.00, outputTokens: 15.00, cacheWriteInputTokens: 3.75, cacheReadInputTokens: 0.30 },
            'claude-opus-4': { inputTokens: 15.00, outputTokens: 75.00, cacheWriteInputTokens: 18.75, cacheReadInputTokens: 1.50 },
            'gpt-4.1': { inputTokens: 2.00, outputTokens: 8.00 },
            'gpt-4.1-mini': { inputTokens: 0.40, outputTokens: 1.60 },
            'gpt-4.1-nano': { inputTokens: 0.10, outputTokens: 0.40 },
            'gpt-4o': { inputTokens: 3.75, outputTokens: 15.00 },
            // Assuming Nebius prices, may be higher
            'qwen2.5-vl-72b': { inputTokens: 0.25, outputTokens: 0.75 }
        };

        let inputTokenCost: number | undefined;
        let outputTokenCost: number | undefined;
        let cacheWriteInputTokenCost: number | undefined;
        let cacheReadInputTokenCost: number | undefined;

        for (const [name, costs] of Object.entries(knownCostMap)) {
            if (model.includes(name)) {
                inputTokenCost = costs.inputTokens / 1_000_000;
                outputTokenCost = costs.outputTokens / 1_000_000;
                cacheReadInputTokenCost = costs.cacheReadInputTokens ? costs.cacheReadInputTokens / 1_000_000 : undefined;
                cacheWriteInputTokenCost = costs.cacheWriteInputTokens ? costs.cacheWriteInputTokens / 1_000_000 : undefined;
            }
        }

        // console.log("cacheWriteInputTokenCost:", cacheWriteInputTokenCost);
        // console.log("cacheWriteInputTokens:", cacheWriteInputTokens);

        const usage: ModelUsage = {
            llm: {
                provider: this.options.llm.provider,
                model: model
            },//this.options.llm,
            inputTokens: inputTokens,
            outputTokens: outputTokens,
            ...(cacheWriteInputTokens ? { cacheWriteInputTokens } : {}),
            ...(cacheReadInputTokens ? { cacheReadInputTokens } : {}),
            ...(inputTokenCost ? {
                inputCost: inputTokens * inputTokenCost +
                    ( cacheWriteInputTokenCost ? cacheWriteInputTokenCost * cacheWriteInputTokens : 0.0 ) +
                    ( cacheReadInputTokenCost ? cacheReadInputTokenCost * cacheReadInputTokens : 0.0 )
            } : {}),
            ...(outputTokenCost ? { outputCost: outputTokens * outputTokenCost } : {}),
            // ...(cacheWriteInputTokenCost ? { : inputTokens * inputTokenCost } : {}),
            // ...(cacheReadInputTokenCost ? { outputCost: outputTokens * outputTokenCost } : {})
        };

        this.events.emit('tokensUsed', usage);
        //console.log("Usage:", usage);

        this.prevTotalInputTokens = inputTokens;
        this.prevTotalOutputTokens = outputTokens;
    }

    async partialAct<T>(
        context: AgentContext, // Changed to ModularMemoryContext
        task: string,
        data: MultiMediaContentPart[],
        actionVocabulary: ActionDefinition<T>[]
    ): Promise<{ reasoning: string, actions: Action[] }> {
        const tb = new TypeBuilder();

        // Convert action definitions based on model
        const modelName = this.describeModel();
        const convertedActions = convertActionDefinitionsForModel(actionVocabulary, modelName);

        tb.PartialRecipe.addProperty('actions', tb.list(convertActionDefinitionsToBaml(tb, convertedActions))).description('Always provide at least one action');

        const start = Date.now();
        // Assuming this.baml.CreatePartialRecipe is now typed to accept ModularMemoryContext
        // after BAML generation picked up changes in planner.baml
        const response = await this.baml.CreatePartialRecipe( 
            context,
            task,
            data,
            this.options.llm.provider === 'claude-code',
            { tb }
        );
        this.logger.trace(`createPartialRecipe took ${Date.now()-start}ms`);
        // BAML does not carry over action type to @@dynamic of PartialRecipe, so forced cast necssary
        //return response as unknown as { actions: z.infer<ActionDefinition<T>['schema']>[] };//, finished: boolean };
        this._reportUsage();
        return {
            reasoning: response.reasoning,//(response.observations ? response.observations + " " : "") + response.meta_reasoning + " " + response.reasoning,
            actions: response.actions// as z.infer<ActionDefinition<T>['schema']>[]
        }
    }

    async extract<T extends Schema>(instructions: string, schema: T, screenshot: Image, domContent: string): Promise<z.infer<T>> {
        const tb = new TypeBuilder();

        if (schema instanceof z.ZodObject) {
            // populate ExtractedData with schema KVs instead of wrapping in data key unnecessarily
            for (const [key, fieldSchema] of Object.entries(schema.shape)) {
                tb.ExtractedData.addProperty(key, convertZodToBaml(tb, fieldSchema as any));
            }
        } else {
            // for array or primitive have to wrap data key
            tb.ExtractedData.addProperty('data', convertZodToBaml(tb, schema));
        }
        // } else if (schema instanceof z.ZodArray) {

        // }

        const resp = await this.baml.ExtractData(
            instructions,
            await screenshot.toBaml(),
            domContent,
            this.options.llm.provider === 'claude-code',
            { tb }
        );
        this._reportUsage();

        if (schema instanceof z.ZodObject) {
            return resp;
        } else {
            return resp.data;
        }
    }
    // ^ extract could prob be a subset of query w trimmed mem

    async query<T extends Schema>(context: AgentContext, query: string, schema: T): Promise<z.infer<T>> {
        const tb = new TypeBuilder();

        if (schema instanceof z.ZodObject) {
            // populate ExtractedData with schema KVs instead of wrapping in data key unnecessarily
            for (const [key, fieldSchema] of Object.entries(schema.shape)) {
                tb.QueryResponse.addProperty(key, convertZodToBaml(tb, fieldSchema as any));
            }
        } else {
            // for array or primitive have to wrap data key
            tb.QueryResponse.addProperty('data', convertZodToBaml(tb, schema));
        }

        const resp = await this.baml.QueryMemory(
            context,
            query,
            this.options.llm.provider === 'claude-code',
            { tb }
        );
        this._reportUsage();
        
        if (schema instanceof z.ZodObject) {
            return resp;
        } else {
            return resp.data;
        }
    }

    // async classifyCheckFailure(screenshot: Image, check: string, existingRecipe: Action[], tabState: TabState): Promise<BugDetectedFailure | MisalignmentFailure> {
    //     const stringifiedExistingRecipe = [];
    //     for (const action of existingRecipe) {
    //         stringifiedExistingRecipe.push(JSON.stringify(action, null, 4))
    //     }

    //     const start = Date.now();
    //     const response = await this.baml.ClassifyCheckFailure(
    //         {
    //             screenshot: await screenshot.toBaml(),//Image.fromBase64('image/png', screenshot.image),
    //             actionHistory: stringifiedExistingRecipe,
    //             tabState: tabState
    //         },
    //         check
    //     );
    //     this.logger.trace(`classifyCheckFailure took ${Date.now()-start}ms`);
    //     //return response.check;

    //     if (response.classification === 'bug') {
    //         return {
    //             variant: 'bug',
    //             title: response.title,
    //             expectedResult: response.expectedResult,
    //             actualResult: response.actualResult,
    //             severity: response.severity
    //         }
    //     }
    //     else {
    //         return {
    //             variant: 'misalignment',
    //             message: response.message
    //         }
    //     }
    // }

    

    // async diagnoseTargetNotFound(
    //     screenshot: Screenshot,
    //     step: TestStepDefinition,
    //     target: string,
    //     existingRecipe: ActionIngredient[]
    // ): Promise<BugDetectedFailure | MisalignmentFailure> {
    //     const downscaledScreenshot = await this.transformScreenshot(screenshot);

    //     const stringifiedExistingRecipe = [];
    //     for (const action of existingRecipe) {
    //         stringifiedExistingRecipe.push(JSON.stringify(action, null, 4))
    //     }

    //     const start = Date.now();
    //     const response = await this.baml.DiagnoseTargetNotFound(
    //         Image.fromBase64('image/png', downscaledScreenshot.image),
    //         step,
    //         target,
    //         //action.target,
    //         //JSON.stringify(action, null, 4),//action,
    //         stringifiedExistingRecipe
    //     );
    //     this.logger.trace(`classifyStepActionFailure took ${Date.now()-start}ms`);

    //     if (response.classification === 'bug') {
    //         return {
    //             variant: 'bug',
    //             title: response.title,
    //             expectedResult: response.expectedResult,
    //             actualResult: response.actualResult,
    //             severity: response.severity
    //         }
    //     }
    //     else {
    //         return {
    //             variant: 'misalignment',
    //             message: response.message
    //         }
    //     }
    // }
}
