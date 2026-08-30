import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT_DIR, requiredEnv } from "./config";

const execFileAsync = promisify(execFile);

export const EVALUATION_IDENTITY = {
  issuer: "https://eval.chat-pdf.local",
  subject: "eval-harness-v1",
  tokenIdentifier: "https://eval.chat-pdf.local|eval-harness-v1",
};

export async function convexRun<T>(
  functionName: string,
  args: Record<string, unknown> = {},
  options: { identity?: boolean; push?: boolean } = {},
): Promise<T> {
  const deployment = requiredEnv("CONVEX_DEPLOYMENT");
  if (/^prod(?::|$)/i.test(deployment) || process.argv.includes("--prod")) {
    if (!process.argv.includes("--allow-prod")) {
      throw new Error(
        "Evaluation commands refuse production. Use a development deployment.",
      );
    }
  }

  const cliArgs = [
    "exec",
    "convex",
    "run",
    functionName,
    JSON.stringify(args),
    "--deployment",
    "dev",
  ];
  if (options.identity) {
    cliArgs.push("--identity", JSON.stringify(EVALUATION_IDENTITY));
  }
  if (options.push) cliArgs.push("--push");

  const { stdout } = await execFileAsync("pnpm", cliArgs, {
    cwd: ROOT_DIR,
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  const output = stdout.trim();
  if (!output) return null as T;

  try {
    return JSON.parse(output) as T;
  } catch (error) {
    throw new Error(
      `Could not parse Convex output for ${functionName}: ${output.slice(0, 500)}`,
      { cause: error },
    );
  }
}
