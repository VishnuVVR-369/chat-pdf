import { loadLocalEnvironment } from "./config";
import { generateDataset } from "./generate-dataset";
import { publishSnapshot } from "./publish";
import { renderRunReports, runEvaluation } from "./run";
import { seedCorpus } from "./seed";

loadLocalEnvironment();

function optionValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  if (command === "seed") {
    await seedCorpus();
    return;
  }
  if (command === "dataset") {
    await generateDataset();
    return;
  }
  if (command === "run") {
    const limitValue = optionValue("--limit");
    const concurrencyValue = optionValue("--concurrency");
    await runEvaluation({
      ...(limitValue !== undefined ? { limit: Number(limitValue) } : {}),
      ...(concurrencyValue !== undefined
        ? { concurrency: Number(concurrencyValue) }
        : {}),
      ...(optionValue("--case") ? { caseId: optionValue("--case") } : {}),
      ...(optionValue("--resume") ? { resume: optionValue("--resume") } : {}),
      skipCalibration: process.argv.includes("--skip-calibration"),
    });
    return;
  }
  if (command === "publish") {
    await publishSnapshot(process.argv[3]);
    return;
  }
  if (command === "report") {
    const runId = process.argv[3];
    if (!runId) throw new Error("Usage: ... report <run-id>");
    await renderRunReports(runId);
    return;
  }
  throw new Error(
    "Usage: tsx evals/src/cli.ts <seed|dataset|run|report|publish> " +
      "[--limit N] [--case ID] [--resume RUN] [--concurrency N]",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
});
