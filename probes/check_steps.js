const fs = require('fs');
const readline = require('readline');

async function checkSteps() {
  const transcriptPath = 'C:\\Users\\HomePC\\.gemini\\antigravity\\brain\\ac5be4e1-35bf-4825-b886-d619218c86e1\\.system_generated\\logs\\transcript.jsonl';
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const allCmds = [];

  for await (const line of rl) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.step_index >= 4180 && entry.step_index <= 4400 && entry.tool_calls) {
        for (const tc of entry.tool_calls) {
          if (tc.name === 'run_command') {
            allCmds.push({
              step: entry.step_index,
              cmd: tc.args.CommandLine
            });
          }
        }
      }
    } catch (e) {}
  }
  console.log(JSON.stringify(allCmds, null, 2));
}

checkSteps();
