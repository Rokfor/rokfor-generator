/*
 * typst-compile-worker.js
 *
 * One-shot Typst compiler. Runs a SINGLE compile in its own OS process and
 * then exits, so the operating system reclaims 100% of the memory typst used
 * (fonts, decoded images, comemo memoization cache, the whole native "world").
 *
 * This exists because @myriaddreamin/typst-ts-node-compiler leaks native
 * memory that V8's garbage collector cannot see or free: compiling large,
 * image-heavy documents in the long-lived server process makes RSS climb by
 * gigabytes per run and never come back down until the process is restarted.
 * Isolating each compile in a short-lived child process gives us that
 * "restart" for free after every single run.
 *
 * Invocation:
 *   node typst-compile-worker.js <jobFile.json>
 *
 * jobFile.json:
 *   {
 *     "workspace":   "/abs/path/to/template",
 *     "fontArgs":    [{ "fontPaths": ["/abs/path/to/fonts"] }],
 *     "contentFile": "/abs/path/to/input.typ",   // UTF-8 typst source
 *     "outputFile":  "/abs/path/to/output.pdf",  // written on success
 *     "inputs":      { "key": "value" }           // optional sys.inputs
 *   }
 *
 * Exit code 0 on success (PDF written to outputFile).
 * Exit code 1 on failure (reason printed to stderr).
 */

const fs = require('fs');
const typst = require('@myriaddreamin/typst-ts-node-compiler');

async function main() {
  const jobFile = process.argv[2];
  if (!jobFile) {
    console.error('typst-worker: missing job file argument');
    process.exit(1);
  }

  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const mainFileContent = fs.readFileSync(job.contentFile, 'utf8');

  const $typst = typst.NodeCompiler.create({
    workspace: job.workspace,
    fontArgs: job.fontArgs,
  });

  const buffer = await $typst.pdf({
    mainFileContent,
    ...(job.inputs ? { inputs: job.inputs } : {}),
  });

  fs.writeFileSync(job.outputFile, buffer);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // Serialise the diagnostic so the parent can surface it. typst compile
    // errors carry their detail in message and/or enumerable props rather
    // than a JS stack, so include everything we can.
    const parts = [];
    if (err && err.message) parts.push(err.message);
    try {
      const extra = JSON.stringify(err, Object.getOwnPropertyNames(err || {}));
      if (extra && extra !== '{}') parts.push(extra);
    } catch (_) { /* ignore */ }
    if (!parts.length) parts.push(String(err));
    console.error(parts.join(' | '));
    process.exit(1);
  });
