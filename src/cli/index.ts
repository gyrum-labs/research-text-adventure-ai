/*
 * The command line.
 *
 * `play` is a person at the terminal. `agent` is a policy, headless. `replay`
 * checks that a recorded run still reproduces. `exp` runs an experiment.
 */

import { Command } from 'commander';
import { adventureById, ADVENTURES } from '../adventures/index.js';
import { GOLD_PATH } from '../adventures/mission-impossible/gold-path.js';
import type { ContextStrategy } from '../agents/context.js';
import { play } from './play.js';
import { runAgent, type PolicyName } from './agent.js';
import { runExp02 } from './exp-02.js';
import { runExp03 } from './exp-03.js';
import { runExp04 } from './exp-04.js';
import { runExp05 } from './exp-05.js';
import { runExp06 } from './exp-06.js';
import { runComparison, renderComparison, providersFor } from './exp-08.js';
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MatrixConfig } from '../runner/matrix.js';
import { createProvider, type ProviderName } from './provider.js';
import {
  writePlan, describeBatch, describeLedger, startBatch, publishReport, booksFor,
  type BatchOptions,
} from './batch.js';
import { replayTranscript } from '../runner/replay.js';

const program = new Command();

program
  .name('research-text-adventure-ai')
  .description('A text adventure you can play, and a laboratory for AI agents that try.')
  .version('0.1.0');

program
  .command('play')
  .description('Play the adventure at the terminal')
  .option('-s, --scenario <id>', 'which adventure', 'mission-impossible')
  .action(async (options: { scenario: string }) => {
    await play(adventureById(options.scenario));
  });

program
  .command('agent')
  .description('Run a policy against the adventure, headless')
  .option('-s, --scenario <id>', 'which adventure', 'mission-impossible')
  .option('-p, --policy <name>', 'scripted or random', 'scripted')
  .option('--seed <n>', 'seed for the random policy', '1')
  .option('--max-turns <n>', 'turn budget', '30')
  .option('--seeds <n>', 'how many random-policy seeds to include', '20')
  .option('--matrix <path>', 'the matrix configuration', 'configs/matrix.default.json')
  .option('-o, --out <path>', 'where to write the transcript')
  .option('-q, --quiet', 'print only the summary', false)
  .action(async (options: Record<string, string | boolean>) => {
    await runAgent({
      adventure: adventureById(options.scenario as string),
      policy: options.policy as PolicyName,
      seed: Number(options.seed),
      maxTurns: Number(options.maxTurns),
      transcriptPath: options.out as string | undefined,
      quiet: options.quiet as boolean,
    });
  });

program
  .command('replay')
  .description('Re-apply a transcript and check the hash chain')
  .argument('<file>', 'the transcript to replay')
  .option('-s, --scenario <id>', 'which adventure', 'mission-impossible')
  .action((file: string, options: { scenario: string }) => {
    const result = replayTranscript(file, adventureById(options.scenario));
    if (result.ok) {
      console.log(`replay: ${result.steps} command(s) reproduced exactly`);
      return;
    }
    console.error(
      `replay: MISMATCH at step ${result.mismatch?.step}\n` +
        `  expected ${result.mismatch?.expected}\n` +
        `  actual   ${result.mismatch?.actual}`,
    );
    process.exitCode = 1;
  });

program
  .command('exp')
  .description('Run one of the experiments')
  .argument('<number>', 'the experiment number, 01 to 06')
  .option('--provider <name>', 'mock, anthropic, openai or ollama', 'mock')
  .option('--model <name>', 'the model to ask for')
  .option('--base-url <url>', 'the endpoint of an OpenAI-compatible provider')
  .option('--api-key-env <name>', 'the environment variable the key is read from')
  .option('--strategy <name>', 'none, full, window or structured', 'structured')
  .option('--max-turns <n>', 'turn budget', '30')
  .option('--seeds <n>', 'how many random-policy seeds to include', '20')
  .option('--matrix <path>', 'the matrix configuration', 'configs/matrix.default.json')
  .option('--adventure <id>', 'which world the exp 05 matrix plays', 'mission-impossible')
  .option('--summarise-only', 'report the transcripts on disk without calling a provider', false)
  .action(async (number: string, options: Record<string, string | boolean>) => {
    switch (number) {
      case '01':
        await runAgent({
          adventure: adventureById('mission-impossible'),
          policy: 'scripted',
          transcriptPath: 'runs/exp-01/scripted.jsonl',
        });
        console.log('');
        console.log('The gold path:');
        console.log(`  ${GOLD_PATH.join(' · ')}`);
        break;
      case '02':
        console.log(runExp02(adventureById('mission-impossible')));
        break;
      case '03':
        console.log(
          await runExp03(adventureById('mission-impossible'), {
            provider: createProvider(options['provider'] as ProviderName, options['model'] as string | undefined, {
              ...(options['baseUrl'] === undefined
                ? {}
                : { baseUrl: String(options['baseUrl']) }),
              ...(options['apiKeyEnv'] === undefined
                ? {}
                : { apiKeyEnv: String(options['apiKeyEnv']) }),
            }),
            strategy: options['strategy'] as ContextStrategy,
            budgets: { maxTurns: Number(options['maxTurns']) },
          }),
        );
        break;
      case '04':
        console.log(
          await runExp04(adventureById('mission-impossible'), {
            seeds: Number(options['seeds'] ?? 20),
          }),
        );
        break;
      case '06':
        console.log(await runExp06());
        break;
      case '08': {
        const path = String(options['matrix'] ?? 'configs/matrix.live-questjs.json');
        const config = JSON.parse(readFileSync(path, 'utf8')) as {
          models: Array<{
            id: string;
            provider: string;
            model: string;
            baseUrl?: string;
            apiKeyEnv?: string;
          }>;
          conditions?: string[];
          seeds?: number;
          maxTurns?: number;
        };
        const cells = await runComparison({
          models: providersFor(config.models),
          conditions: config.conditions,
          seeds: config.seeds,
          maxTurns: config.maxTurns,
          root: 'runs/exp-08',
          resultsDir: 'results/exp-08',
        });
        console.log('Experiment 08: the engine comparison.');
        console.log('');
        console.log(renderComparison(cells));
        const solved = cells.filter((cell) => cell.outcome === 'success').length;
        console.log('');
        console.log(`solved ${solved} of ${cells.length} runs on the QuestKit engine`);
        break;
      }
      case '05': {
        const path = String(options['matrix'] ?? 'configs/matrix.default.json');
        const config = JSON.parse(readFileSync(path, 'utf8')) as MatrixConfig;
        const adventure = adventureById((options['adventure'] as string) ?? 'mission-impossible');
        console.log(
          await runExp05(adventure, {
            config,
            ...(options['summariseOnly'] === true ? { summariseOnly: true } : {}),
          }),
        );
        break;
      }
      default:
        console.error(`experiment ${number} is not implemented yet`);
        process.exitCode = 1;
    }
  });

program
  .command('adventures')
  .description('List the adventures')
  .action(() => {
    for (const adventure of Object.values(ADVENTURES)) {
      console.log(`${adventure.id}  ${adventure.title}  (${adventure.version})`);
    }
  });

program
  .command('batch')
  .description('The repeatability experiment: ten runs per world. Only `start` calls a model.')
  .option('--root <dir>', 'where the plan, books and runs live', 'runs/batch')
  .option('--runs <n>', 'runs per world', '10')
  .option('--model <name>', 'the model to ask for', 'deepseek/deepseek-chat')
  .option('--max-total-usd <usd>', 'the most this experiment may spend', '0.40')
  .option('--max-per-run-usd <usd>', 'the most one run may be reserved for', '0.02')
  .action(async (options: Record<string, string>, command: { args: string[] }) => {
    const parsed: BatchOptions = {
      root: options.root!,
      runs: Number(options.runs),
      model: options.model!,
      maxTotalUsd: Number(options.maxTotalUsd),
      maxPerRunUsd: Number(options.maxPerRunUsd),
    };
    const verb = command.args[0] ?? 'help';
    try {
      switch (verb) {
        case 'plan': {
          writePlan(parsed);
          console.log(describeBatch(parsed));
          console.log(`plan written to ${parsed.root}/plan.json`);
          return;
        }
        case 'dry-run':
          console.log(describeBatch(parsed));
          console.log('dry run: no model was called.');
          return;
        case 'status': {
          if (!existsSync(join(parsed.root, 'plan.json'))) {
            console.log('no plan on disk. Run `batch plan` first.');
            return;
          }
          const { ledger } = booksFor(parsed);
          console.log(describeLedger(ledger));
          return;
        }
        case 'start': {
          console.log(await startBatch(parsed));
          return;
        }
        case 'report': {
          console.log(`findings written to ${publishReport(parsed)}`);
          const { ledger } = booksFor(parsed);
          console.log(describeLedger(ledger));
          return;
        }
        default:
          console.log('usage: batch <plan|dry-run|status|start|report> [--root dir] [--runs n]');
          return;
      }
    } catch (error) {
      console.log(`batch ${verb} failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
