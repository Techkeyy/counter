const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function extractVpsActions() {
  const transcriptPath = 'C:\\Users\\HomePC\\.gemini\\antigravity\\brain\\ac5be4e1-35bf-4825-b886-d619218c86e1\\.system_generated\\logs\\transcript.jsonl';
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const sshCommands = [];

  for await (const line of rl) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.tool_calls) {
        for (const tc of entry.tool_calls) {
          if (tc.name === 'run_command' && tc.args && tc.args.CommandLine) {
            const cmd = tc.args.CommandLine;
            if (cmd.includes('ssh') || cmd.includes('canned-vps') || cmd.includes('103.195.188.198') || cmd.includes('scp')) {
              sshCommands.push({
                step: entry.step_index,
                time: entry.created_at,
                command: cmd
              });
            }
          }
        }
      }
    } catch (e) {}
  }

  fs.writeFileSync('C:\\Users\\HomePC\\Desktop\\Counter\\probes\\vps_command_audit.json', JSON.stringify(sshCommands, null, 2));
  console.log(`Extracted ${sshCommands.length} VPS-related command invocations.`);
}

extractVpsActions().catch(console.error);
