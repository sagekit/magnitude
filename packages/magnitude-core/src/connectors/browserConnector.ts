import { AgentConnector } from ".";
//import { Observation, BamlRenderable } from "@/memory";
import { WebHarness } from "@/web/harness";
import { ActionDefinition } from '@/actions';
import { webActions } from '@/actions/webActions';
import { Browser, BrowserContext, BrowserContextOptions, LaunchOptions } from "playwright";
import { BrowserOptions, BrowserProvider } from "@/web/browserProvider";
import logger from "@/logger";
import { Logger } from 'pino';
import { TabState } from '@/web/tabs';
import { Observation } from "@/memory/observation";
import { Image } from "@/memory/image";
import { ActionVisualizerOptions } from "@/web/visualizer";

// export type BrowserOptions = ({ instance: Browser } | { launchOptions?: LaunchOptions }) & {
//     contextOptions?: BrowserContextOptions;
// };

// const foo: BrowserOptions = {
//     launchOptions: {},
//     instance: {},

// }

// Changed back to 3 - too many situations where the amnesia of having only 1 is very problematic and makes agent act stupidly
// With caching, using 3 is relatively ok tradeoff
// Maybe try 2 for now, or could do 3 when prompt caching available else 2
const DEFAULT_MIN_RETAINED_SCREENSHOTS = 2;

export interface BrowserConnectorOptions {
    //browser?: Browser
    browser?: BrowserOptions
    url?: string
    //browserContextOptions?: BrowserContextOptions
    virtualScreenDimensions?: { width: number, height: number },
    minScreenshots?: number,
    visuals?: ActionVisualizerOptions
}

export interface BrowserConnectorStateData {
    screenshot: Image;
    tabs: TabState;
}

export class BrowserConnector implements AgentConnector {
    public readonly id: string = "web";
    private harness!: WebHarness;
    private options: BrowserConnectorOptions;
    private browser?: Browser;
    private context!: BrowserContext;
    private logger: Logger;

    constructor(options: BrowserConnectorOptions = {}) {
        // console.log("options", options)
        // console.log("options.screenshotMemoryLimit", options.screenshotMemoryLimit)
        this.options = options;
        this.logger = logger.child({
            name: `connectors.${this.id}`
        });
    }


    async onStart(): Promise<void> {
        this.logger.info("Starting...");
        
        this.logger.info("Creating new browser context.");

        this.context = await BrowserProvider.getInstance().newContext(this.options.browser);

        //const contextOptions = this.options.browser && 'contextOptions' in this.options.browser ? this.options.browser.contextOptions : {};
        
        this.harness = new WebHarness(this.context, {
            //fallbackViewportDimensions: contextOptions?.viewport ?? { width: 1024, height: 768 },
            virtualScreenDimensions: this.options.virtualScreenDimensions,
            visuals: this.options.visuals
        });
        await this.harness.start();
        this.logger.info("WebHarness started.");

        if (this.options.url) {
            this.logger.info(`Navigating to initial URL: ${this.options.url}`);
            await this.harness.navigate(this.options.url);
            //await this.harness.waitForStability();
        }
        this.logger.info("Started successfully.");
    }

    async onStop(): Promise<void> {
        this.logger.info("Stopping...");
        if (this.harness) {
            await this.harness.stop();
            this.logger.info("WebHarness cleaned up.");
        }
        if (this.context) {
            await this.context.close();
            this.logger.info("Browser context closed.");
        }
        // Note: We don't close this.browser here if obtained from BrowserProvider,
        // as BrowserProvider manages the singleton browser lifecycle.
        // If this.options.browser was provided, its lifecycle is managed externally.
        this.logger.info("Stopped successfully.");
    }

    getActionSpace(): ActionDefinition<any>[] {
        return [...webActions];
    }
    
    // public get page(): Page {
    //     if (!this.harness || !this.harness.page) {
    //         throw new Error("WebInteractionConnector: Harness or Page is not available. Ensure onStart has completed.");
    //     }
    //     return this.harness.page;
    // }

    public getHarness(): WebHarness {
        if (!this.harness) {
            throw new Error("WebInteractionConnector: Harness is not available. Ensure onStart has completed.");
        }
        return this.harness;
    }

    private async captureCurrentState(): Promise<BrowserConnectorStateData> {
        if (!this.harness || !this.harness.page) {
            throw new Error("WebInteractionConnector: Harness or Page is not available for capturing state.");
        }
        const [screenshot, tabs] = await Promise.all([
            this.harness.screenshot(),
            this.harness.retrieveTabState()
        ]);
        //const resizedScreenshot = await screenshot.resize()
        // if (this.options.autoResize) {
        //     return { screenshot: await screenshot.resize(this.options.autoResize.width, this.options.autoResize.height), tabs: tabs };
        // }
        return { screenshot: await this.transformScreenshot(screenshot), tabs: tabs };
    }

    async transformScreenshot(screenshot: Image): Promise<Image> {
        if (this.options.virtualScreenDimensions) {
            return await screenshot.resize(this.options.virtualScreenDimensions.width, this.options.virtualScreenDimensions.height);
        } else {
            return screenshot;
        }
    }

    public async getLastScreenshot(): Promise<Image> {
        //return { image: "", dimensions: { width: 0, height: 0 } };
        // TODO: better to use last
        return (await this.captureCurrentState()).screenshot;
    }

    async collectObservations(): Promise<Observation[]> {
        const currentState = await this.captureCurrentState();
        const observations: Observation[] = [];

        const currentTabs = currentState.tabs;
        let tabInfo = "Open Tabs:\n";
        currentTabs.tabs.forEach((tab, index) => {
            tabInfo += `${index === currentTabs.activeTab ? '[ACTIVE] ' : ''}${tab.title} (${tab.url})`;
        });

        //console.log("this.options.screenshotMemoryLimit", this.options.screenshotMemoryLimit);
        const screenshotLimit = this.options.minScreenshots ?? DEFAULT_MIN_RETAINED_SCREENSHOTS;
        //console.log("screenshotLimit:", screenshotLimit);

        observations.push(
            Observation.fromConnector(
                this.id,
                await this.transformScreenshot(currentState.screenshot),
                { type: 'screenshot', limit: screenshotLimit, dedupe: true }
            )
        );
        observations.push(
            Observation.fromConnector(
                this.id,
                tabInfo,
                { type: 'tabinfo', limit: 1 }
            )
        );
        return observations;
    }

    async getInstructions(): Promise<void | string> {
        return;
    }
}
