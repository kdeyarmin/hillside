/**
 * POSTing JSON to an authenticated API, from a script.
 *
 * curl rather than Node's fetch, for two reasons that both bite in this repo's
 * environment: outbound HTTPS goes through an agent proxy with its own CA
 * bundle, which curl picks up from the environment and fetch does not; and the
 * existing downloader in `photo.mjs` already goes through curl, so there is one
 * network path to reason about rather than two.
 *
 * The credential goes into a 0600 config file, never into argv. Anything passed
 * on a command line is readable from the process table by every other process on
 * the machine, and an API key is exactly the thing not to leak that way. The
 * file is removed in a `finally`, so it goes even when curl fails.
 */
import { writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** curl's config parser reads quoted values, so a value cannot carry either. */
export function assertHeaderSafe(label, value) {
  if (/["\r\n]/.test(value)) {
    throw new Error(`${label} contains a quote or a newline, which cannot be sent safely.`);
  }
}

export async function postJson({ url, headers = {}, body, timeoutSeconds = 600, tmpDir = '/tmp' }) {
  assertHeaderSafe('url', url);
  for (const [name, value] of Object.entries(headers)) assertHeaderSafe(`header ${name}`, value);

  const stamp = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  const bodyFile = path.join(tmpDir, `postjson-body-${stamp}.json`);
  const outFile = path.join(tmpDir, `postjson-out-${stamp}`);
  const configFile = path.join(tmpDir, `postjson-conf-${stamp}`);

  const lines = [
    `url = "${url}"`,
    'request = "POST"',
    'header = "Content-Type: application/json"',
    ...Object.entries(headers).map(([name, value]) => `header = "${name}: ${value}"`),
    `data = "@${bodyFile}"`,
    `output = "${outFile}"`,
    'write-out = "%{http_code}"',
    'silent',
    'show-error',
    `max-time = ${Number(timeoutSeconds)}`
  ];

  try {
    await writeFile(configFile, `${lines.join('\n')}\n`, { mode: 0o600 });
    await writeFile(bodyFile, JSON.stringify(body));

    // Image payloads come back base64 in JSON, so several megabytes of response
    // is normal and the default 1 MB buffer is not enough. The body goes to a
    // file; only the status code comes back on stdout.
    const { stdout } = await run('curl', ['--config', configFile], { maxBuffer: 64 * 1024 * 1024 });
    const status = Number(String(stdout).trim().slice(-3));
    const raw = existsSync(outFile) ? await readFile(outFile, 'utf8') : '';

    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      // Left null on purpose: a non-JSON body is itself the diagnostic, and the
      // caller reports a slice of it rather than a parse error.
    }

    return { status, json, raw };
  } finally {
    await Promise.all([
      rm(configFile, { force: true }),
      rm(bodyFile, { force: true }),
      rm(outFile, { force: true })
    ]);
  }
}
