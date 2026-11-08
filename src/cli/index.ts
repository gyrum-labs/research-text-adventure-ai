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
import { readFileSync } from 'node:fs';
import type { MatrixConfig } from '../runner/matrix.js';
import { createProvider, type ProviderName } from './provider.js';
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
  .action(async (number: string, options: Record<string, string>) => {
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
            provider: createProvider(options['provider'] as ProviderName, options['model'], {
              ...(options['baseUrl'] === undefined ? {} : { baseUrl: options['baseUrl'] }),
              ...(options['apiKeyEnv'] === undefined ? {} : { apiKeyEnv: options['apiKeyEnv'] }),
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
      case '05': {
        const path = options['matrix'] ?? 'configs/matrix.default.json';
        const config = JSON.parse(readFileSync(path, 'utf8')) as MatrixConfig;
        console.log(await runExp05(adventureById('mission-impossible'), { config }));
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

await program.parseAsync(process.argv);
