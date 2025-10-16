import { program } from "commander";
//import { execSync } from "child_process";
import { execa } from 'execa';
import fs from "fs-extra";
import path from "path";
import os from "os";
import { bold, blueBright, gray, cyanBright } from "ansis";
import { intro, outro, spinner, log, text, select, confirm, isCancel, multiselect } from '@clack/prompts';
import { VERSION } from "./version";
import cuid2 from '@paralleldrive/cuid2';
import { completeClaudeCodeAuthFlow, getValidClaudeCodeAccessToken } from "./claudeCode";

const createId = cuid2.init({ length: 12 });

const REPO_URL = "https://github.com/magnitudedev/magnitude-scaffold";
const REPO_BRANCH = "main";


const title = String.raw`
 __  __                    _ _             _      
|  \/  | __ _  __ _ _ __  (_) |_ _   _  __| | ___ 
| |\/| |/ _' |/ _' | '_ \ | | __| | | |/ _' |/ _ \
| |  | | (_| | (_| | | | || | |_| |_| | (_| |  __/
|_|  |_|\__,_|\__, |_| |_||_|\__|\__,_|\__,_|\___|
              |___/                              
`;

interface ProjectInfo {
    projectName: string;
    model: 'claude' | 'qwen',
    provider: 'anthropic' | 'claude-code' | 'openrouter',
    apiKey?: string,
    assistant: 'cursor' | 'claudecode' | 'cline' | 'gemini' | 'windsurf' | 'none',
    //assistants: ('cursor' | 'claudecode' | 'cline' | 'windsurf')[]
    // assistants: {
    //     cursor: boolean,
    //     cline: boolean,
    //     windsurf: boolean
    // }
    //assistant: 'cursor' | 'cline' | 'windsurf' | null
};

async function establishProjectInfo(info: Partial<ProjectInfo>): Promise<ProjectInfo> {

    const projectName = info.projectName ? info.projectName : await text({
        message: 'What should your project be called?',
        placeholder: 'my-awesome-browser-app',
        validate(value) {
            if (value.trim().length === 0) return "Project name cannot be empty";

            const projectDir = path.resolve(process.cwd(), value);

            if (fs.existsSync(projectDir)) {
                return `Directory ${projectDir} already exists`;
            }
        }
    });
    if (isCancel(projectName)) {
        log.warn("Come back soon!");
        process.exit(0);
    }

    let model;
    while (true) {
        model = await select({
            message: 'What model would you like to use?',
            options: [
                { value: 'claude', label: 'Claude Sonnet 4 (Recommended)' },
                { value: 'qwen', label: 'Qwen 2.5 VL 72B' },
                { value: 'docs', label: 'Why only these models?' }
            ]
        });

        if (isCancel(model)) {
            log.warn("Didn't like the model selection? Only larger 'visually grounded' models work with Magnitude");
            log.message("See docs for details: https://docs.magnitude.run/customizing/llm-configuration");
            process.exit(0);
        }

        if (model === 'docs') {
            log.warn("Only larger 'visually grounded' models work with Magnitude");
            log.message("See docs for details: https://docs.magnitude.run/customizing/llm-configuration");
        } else {
            break;
        }
    }

    let provider: 'anthropic' | 'claude-code' | 'openrouter' | undefined;
    let apiKey: string | undefined;

    if (model === 'claude') {
        // Look for ANTHROPIC_API_KEY
        // if (process.env.ANTHROPIC_API_KEY) {
        //     await confirm({ message: 'Detected an ANTHROPIC_API_KEY. Use that?' });
        // }
        if (await getValidClaudeCodeAccessToken()) {
            log.info(gray`Detected Claude Pro or Max subscription`);
            provider = 'claude-code';
        } else {
            let useClaudeCode = await confirm({ message: 'Do you have a Claude Pro or Max subscription?' });
            if (isCancel(useClaudeCode)) {
                useClaudeCode = false;
            }
            if (useClaudeCode) {
                await completeClaudeCodeAuthFlow();
                provider = 'claude-code';
            } else {
                // no pro/max sub
                if (process.env.ANTHROPIC_API_KEY) {
                    log.info(gray`Detected ANTHROPIC_API_KEY, using that`);
                    provider = 'anthropic';
                    apiKey = process.env.ANTHROPIC_API_KEY
                }
                else if (process.env.OPENROUTER_API_KEY) {
                    let useOpenRouter = await confirm({ message: 'Detected OPENROUTER_API_KEY, use Claude via OpenRouter?' });
                    if (isCancel(useOpenRouter)) {
                        useOpenRouter = false;
                    }
                    if (useOpenRouter) {
                        provider = 'openrouter';
                        apiKey = process.env.OPENROUTER_API_KEY
                    }
                }
                if (!provider) {
                    provider = 'anthropic';
                    const key = await text({
                        message: 'Please provide a valid ANTHROPIC_API_KEY',
                        placeholder: 'sk-ant-...',
                        validate(value) {
                            if (value.trim().length === 0) return "API key cannot be empty";
                        }
                    });
                    if (isCancel(key)) {
                        log.warn("Come back soon!");
                        process.exit(0);
                    }
                    apiKey = key;
                }
            }
        }
    } else {
        if (process.env.OPENROUTER_API_KEY) {
            log.info(gray`Detected OPENROUTER_API_KEY, using that`);
            provider = 'openrouter';
            apiKey = process.env.OPENROUTER_API_KEY
        }
        if (!provider) {
            provider = 'openrouter';
            const key = await text({
                message: 'Please provide a valid OPENROUTER_API_KEY',
                placeholder: 'sk-or-...',
                validate(value) {
                    if (value.trim().length === 0) return "API key cannot be empty";
                }
            });
            if (isCancel(key)) {
                log.warn("Come back soon!");
                process.exit(0);
            }
            apiKey = key;
        }
    }

    let assistant = await select({
        message: 'Are you using a code assistant?',
        options: [
            { value: 'claudecode', label: 'Claude Code' }, // CLAUDE.md
            { value: 'cline', label: 'Cline' }, // .clinerules
            { value: 'cursor', label: 'Cursor' }, // .cursorrules
            { value: 'gemini', label: 'Gemini CLI' }, // GEMINI.md
            { value: 'windsurf', label: 'Windsurf' }, // .windsurfrules
            { value: 'none', label: 'None' },
        ],

    });

    if (isCancel(assistant)) {
        log.warn("Come back soon!");
        process.exit(0);
    }

    return { projectName, model, provider, apiKey, assistant };
}

async function createProject(tempDir: string, projectDir: string, project: ProjectInfo) {
    //console.log(`Creating a new project in ./${project.projectName}...`);
    fs.ensureDirSync(tempDir);

    //log.info(`temp dir ${tempDir} created`);

    // Make sure project dir is still available
    if (fs.existsSync(projectDir)) {
        throw new Error(`Directory ${project.projectName} already exists.`);
    }

    // Clone scaffold into temp dir
    // execSync(
    //     `git clone --depth 1 -b ${REPO_BRANCH} ${REPO_URL} ${tempDir}`,
    //     { stdio: "ignore" }
    // );
    await execa('git', ['clone', '--depth', '1', '-b', REPO_BRANCH, REPO_URL, tempDir]);

    //log.info(`temp dir ${tempDir} cloned`);

    // === Configure scaffold project ===
    // Remove existing git in scaffold and init git
    const gitDir = path.join(tempDir, ".git");
    if (fs.existsSync(gitDir)) {
        fs.rmSync(gitDir, { recursive: true, force: true });
    }
    //execSync("git init", { stdio: "ignore", cwd: tempDir });
    await execa('git', ['init'], { cwd: tempDir });

    // Configure package name
    const packageJsonPath = path.join(tempDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = fs.readJsonSync(packageJsonPath);
        packageJson.name = project.projectName;
        fs.writeJsonSync(packageJsonPath, packageJson, { spaces: 2 });
    }

    // Configure assistant files
    const assistantMarkdown = fs.readFileSync(path.join(tempDir, '.cursorrules'), 'utf-8');
    //for (const assistant of project.assistants) {
    if (project.assistant === 'cline') {
        fs.writeFileSync(path.join(tempDir, '.clinerules'), assistantMarkdown);
    } else if (project.assistant === 'claudecode') {
        fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), assistantMarkdown);
    } else if (project.assistant === 'gemini') {
        fs.writeFileSync(path.join(tempDir, 'GEMINI.md'), assistantMarkdown);
    } else if (project.assistant === 'windsurf') {
        fs.writeFileSync(path.join(tempDir, '.windsurfrules'), assistantMarkdown);
    }

    if (project.assistant !== 'cursor') {
        fs.rmSync(path.join(tempDir, '.cursorrules'));
    }

    // Configure LLM client via codegen

    let clientSnippet;
    if (project.provider === 'anthropic') {
        const model = 'claude-haiku-4-5-20251001';
        clientSnippet = `llm: {
            provider: 'anthropic',
            options: {
                model: '${model}',
                apiKey: process.env.ANTHROPIC_API_KEY
            }
        },`;
    } else if (project.provider === 'openrouter') {
        const model = project.model === 'claude' ? 'anthropic/claude-haiku-4.5' : 'qwen/qwen2.5-vl-72b-instruct';
        clientSnippet = `llm: {
            provider: 'openai-generic',
            options: {
                baseUrl: 'https://openrouter.ai/api/v1',
                model: '${model}',
                apiKey: process.env.OPENROUTER_API_KEY
            }
        },`;
    } else {
        // claude code
        const model = 'claude-haiku-4-5-20251001';
        clientSnippet = `llm: {
            provider: 'claude-code',
            options: {
                model: '${model}'
            }
        },`;
    }
    // Replace code
    const code = fs.readFileSync(path.join(tempDir, 'src', 'index.ts'), 'utf-8')
    const newCode = code.replace(`narrate: true,`, `narrate: true,\n        // LLM configuration\n        ${clientSnippet}`);
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), newCode);

    // Configure .env with API key
    if (project.apiKey) {
        if (project.provider === 'anthropic') {
            fs.writeFileSync(path.join(tempDir, '.env'), `ANTHROPIC_API_KEY=${project.apiKey}\n`);
        }
        else if (project.provider === 'openrouter') {
             fs.writeFileSync(path.join(tempDir, '.env'), `OPENROUTER_API_KEY=${project.apiKey}\n`);
        }
    }
    

    // Finally, copy to project dir
    fs.copySync(tempDir, projectDir);

    return projectDir;
}

export function getMachineId(): string {
    const dir = path.join(os.homedir(), '.magnitude');
    const filePath = path.join(dir, 'user.json');
    try {
        // Read existing ID if available
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (data.id) return data.id;
        }
        // Generate new ID if needed
        fs.mkdirSync(dir, { recursive: true });
        const id = createId();
        fs.writeFileSync(filePath, JSON.stringify({ id }));
        return id;
    } catch {
        // Fallback to temporary ID if storage fails
        return createId();
    }
}

async function sendEvent() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        await fetch('https://us.i.posthog.com/i/v0/e/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "api_key": "phc_BTdnTtG68V5QG6sqUNGqGfmjXk8g0ePBRu9FIr9upNu",
                "distinct_id": getMachineId(),
                "event": "create-magnitude-app"
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
    } catch (error) {
        clearTimeout(timeoutId);
        console.warn("Failed to send event");
    }
}

function detectRuntime(): { installCommand: string, runCommand: string } {
    const userAgent = process.env.npm_config_user_agent;

    if (userAgent?.startsWith('bun')) {
        return {
            installCommand: 'bun install',
            runCommand: 'bun start',
        };
    }
    if (userAgent?.startsWith('pnpm')) {
        return {
            installCommand: 'pnpm install',
            runCommand: 'pnpm start',
        };
    }
    if (userAgent?.startsWith('yarn')) {
        return {
            installCommand: 'yarn install',
            runCommand: 'yarn start',
        };
    }
    if (userAgent?.startsWith('deno')) {
        // Deno does not have a standard "install" command like npm/bun.
        // It caches dependencies automatically on the first run.
        // We can suggest `deno cache` which pre-downloads and caches dependencies.
        return {
            installCommand: 'deno cache src/index.ts',
            runCommand: 'deno task start',
        };
    }

    // Fallback to npm, which is the most common case
    return {
        installCommand: 'npm install',
        runCommand: 'npm start',
    };
}

program
    .name("create-magnitude-app")
    .description("Create a new Magnitude project from a template.")
    .argument("[project-name]", "The name for the new project.")
    //.option('-n, --name', 'project name')
    .action(async (projectName) => {
        //console.log(`[DIAGNOSTIC] Is TTY? ${process.stdout.isTTY}`);
        // console.log("process.argv:", process.argv);
        // console.log("project name:", projectName);

        if (process.stdout.columns >= 50) console.log(bold(blueBright`${title}`));

        intro(`create-magnitude-app@${VERSION}`);
        const projectInfo = await establishProjectInfo({ projectName });
        //console.log(projectInfo);

        // const s = spinner();
        // s.start('Cloning project template');

        // s.stop('Project template cloned');
        //outro('Time to build browser automations!');
        const createProjectSpinner = spinner();
        createProjectSpinner.start('Creating project');

        const projectDir = path.resolve(process.cwd(), projectInfo.projectName);
        const tempDir = path.join(
            os.tmpdir(),
            "scaffold-clone-" + Math.random().toString(36).substr(2, 9)
        );

        try {
            await createProject(tempDir, projectDir, projectInfo);
        } catch (error) {
            log.error("\nAn error occurred while creating the project:");
            log.error((error as Error).message);
            fs.rmSync(tempDir, { recursive: true, force: true });
            fs.rmSync(projectDir, { recursive: true, force: true });
            process.exit(1);
        }
        createProjectSpinner.stop(`Project created in ${projectDir}`);

        // Detect node runtime to derive preferred install / run commands
        const { installCommand, runCommand } = detectRuntime();

        // Install dependencies in the project
        const installSpinner = spinner();
        installSpinner.start(`Installing dependencies with '${installCommand}'`);

        // execSync(
        //     installCommand,
        //     { cwd: projectDir, stdio: "ignore" }
        // );
        const [command, ...args] = installCommand.split(' ');
        await execa(command, args, { cwd: projectDir });

        installSpinner.stop(`Installed dependencies with '${installCommand}'`);

        outro('Project is ready!');

        console.log(bold(blueBright`Next steps:`));
        console.log(`◆ Run the example automation: ` + cyanBright`cd ${projectInfo.projectName} && ${runCommand}`);
        console.log(`◆ Check out our docs: ${blueBright('https://docs.magnitude.run')}`);
        console.log(`◆ Join our Discord: ${blueBright('https://discord.gg/VcdpMh9tTy')}`);
        console.log();

        await sendEvent();
    })
    .parse(process.argv);