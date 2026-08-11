#!/usr/bin/env node
/**
 * Generates a photograph with an image model and puts it straight through the
 * brand pipeline.
 *
 * The set is licensed stock: real photographs of *somebody else's* bottles,
 * soap and shelves. `brand-mockup.mjs` prints the Hillside mark onto the
 * packaging inside them, which fixes the branding but not the provenance — one
 * gallery frame is still visibly another shop's display. This closes the gap at
 * the other end: make the photograph, then brand it.
 *
 * Output lands in `assets/photography/` by default, which is where
 * `brand-mockup.config.mjs` reads from, so a generated frame joins the same
 * two-step flow as every other image:
 *
 *   1. node scripts/generate-image.mjs --prompt "..." --out patio-containers
 *   2. add a SHOTS entry in scripts/brand-mockup.config.mjs
 *   3. npm run images:mockup -- --only patio-containers
 *
 * Usage:
 *   node scripts/generate-image.mjs --prompt "a cedar patio planter ..." --out patio
 *   node scripts/generate-image.mjs --prompt "..." --out patio --count 4
 *   node scripts/generate-image.mjs --prompt "..." --out hero --dir scenes --focus 0.4,0.55
 *
 * Options:
 *   --prompt   What to photograph. Required.
 *   --out      Output basename without extension. Required.
 *   --provider gemini | openai. Defaults to whichever key is set, preferring
 *              gemini because it is the one that meets the resolution spec.
 *   --dir      assets (default) | catalog | scenes | gallery
 *   --count    Generate N candidates, written as <name>-1 … <name>-N. Max 4.
 *   --focus    "x,y" fractions naming the point to keep centred when cropping.
 *   --grade    Grade strength 0–1, default 1.
 *   --max-kb   Size budget, default 400.
 *   --style    Replace the house style suffix appended to the prompt.
 *   --no-style Append nothing.
 *   --model    Override the model id.
 *   --force    Overwrite existing files.
 *   --no-raw   Do not keep the original generation.
 *   --allow-upscale  Accept output below 1600×1200 (see the note on OpenAI).
 *   --dry-run  Print the request that would be sent, and exit.
 *
 * Credentials come from the environment — GEMINI_API_KEY or OPENAI_API_KEY — and
 * are passed to curl through a private config file rather than on the command
 * line, so they never appear in the process table. GEMINI_BASE_URL and
 * OPENAI_BASE_URL redirect either provider at a gateway or a compatible host.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DIRECTORIES, describe, parseArgs, renderToSpec } from './lib/photo.mjs';
import { assertHeaderSafe, postJson } from './lib/http.mjs';

/**
 * Appended to every prompt unless overridden.
 *
 * Two jobs. It aims the model at the look the grade was measured from — daylight,
 * shallow depth of field, muted and warm rather than punchy — so the generated
 * frame sits beside the twelve licensed ones instead of shouting over them.
 *
 * And it forbids lettering. The mark is composited afterwards by
 * `brand-mockup.mjs` from the real logo artwork; a model asked for a plant shop
 * will happily invent signage and packaging text, which would be both wrong and
 * a decent way to accidentally reproduce somebody's trademark. No people, for
 * the same reason in a different register.
 */
const HOUSE_STYLE =
  'Natural window light, soft shadows, shallow depth of field, 50mm lens. ' +
  'Muted warm palette: cream, sage, terracotta, weathered wood. Matte, unsaturated, ' +
  'editorial rather than glossy. No text, no lettering, no signage, no logos, no ' +
  'packaging labels, no watermarks. No people, no hands.';

/**
 * Both providers take a base-URL override from the environment, the same
 * variables their official SDKs read. Azure, self-hosted gateways and proxies
 * such as LiteLLM all need it, and a hardcoded host would mean editing this file
 * to use any of them.
 */
function baseUrl(envVar, fallback) {
  return (process.env[envVar]?.trim() || fallback).replace(/\/+$/, '');
}

const PROVIDERS = {
  gemini: {
    envVar: 'GEMINI_API_KEY',
    defaultModel: 'imagen-4.0-generate-001',
    maxCount: 4,
    /**
     * Imagen through the Gemini API. Asked for 4:3 at 2K it returns roughly
     * 2048x1536, which clears the 1600x1200 spec with room to crop — the reason
     * this is the preferred provider.
     */
    request(model, prompt, count) {
      const base = baseUrl('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta');
      return {
        url: `${base}/models/${model}:predict`,
        headers: { 'x-goog-api-key': null },
        body: {
          instances: [{ prompt }],
          parameters: {
            sampleCount: count,
            aspectRatio: '4:3',
            sampleImageSize: '2K',
            // Plant photography has no reason to render a person, and not
            // rendering one avoids the likeness question entirely.
            personGeneration: 'dont_allow'
          }
        }
      };
    },
    extract(json) {
      const predictions = json?.predictions;
      if (!Array.isArray(predictions) || !predictions.length) return [];
      return predictions.map((p) => p?.bytesBase64Encoded).filter(Boolean);
    },
    // Imagen refuses some prompts outright and says so in the response rather
    // than in the status code.
    refusal(json) {
      return json?.predictions?.find((p) => p?.raiFilteredReason)?.raiFilteredReason;
    }
  },

  openai: {
    envVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-image-1',
    maxCount: 4,
    /**
     * gpt-image-1 tops out at 1536x1024. Cropped to 4:3 that is 1365x1024,
     * under the 1600x1200 spec, so this provider needs --allow-upscale and the
     * result is softer than a native frame. Documented rather than hidden: the
     * error message below says exactly this when it bites.
     */
    request(model, prompt, count) {
      const base = baseUrl('OPENAI_BASE_URL', 'https://api.openai.com/v1');
      return {
        url: `${base}/images/generations`,
        headers: { Authorization: null },
        body: { model, prompt, n: count, size: '1536x1024', quality: 'high' }
      };
    },
    extract(json) {
      const data = json?.data;
      if (!Array.isArray(data) || !data.length) return [];
      return data.map((d) => d?.b64_json).filter(Boolean);
    },
    refusal() {
      return null;
    }
  }
};

function authHeaderValue(providerName, key) {
  return providerName === 'openai' ? `Bearer ${key}` : key;
}

function describeApiError(status, json, raw) {
  const message =
    json?.error?.message ||
    json?.error?.status ||
    json?.message ||
    (raw ? raw.slice(0, 400) : '(empty response body)');

  if (status === 401 || status === 403) {
    return `The image API rejected the credentials (HTTP ${status}). ${message}`;
  }
  if (status === 429) {
    return `Rate limited or out of quota (HTTP ${status}). ${message}`;
  }
  return `The image API returned HTTP ${status}. ${message}`;
}

function pickProvider(requested) {
  if (typeof requested === 'string') {
    const provider = PROVIDERS[requested];
    if (!provider) {
      throw new Error(`--provider must be one of ${Object.keys(PROVIDERS).join(', ')}`);
    }
    if (!process.env[provider.envVar]) {
      throw new Error(
        `--provider ${requested} needs ${provider.envVar} in the environment, and it is not set.`
      );
    }
    return requested;
  }

  // Gemini first: it is the one that meets the resolution spec without upscaling.
  const found = Object.keys(PROVIDERS).find((name) => process.env[PROVIDERS[name].envVar]);
  if (!found) {
    throw new Error(
      'No image API key found. Set one of:\n' +
        Object.entries(PROVIDERS)
          .map(([name, p]) => `  ${p.envVar}   (--provider ${name})`)
          .join('\n') +
        '\n\nEnvironment variables are read at container start, so a key added to the\n' +
        'environment settings takes effect in the next session, not this one.'
    );
  }
  return found;
}

async function main(args) {
  const promptText = args.prompt;
  const name = args.out;
  if (!promptText || typeof promptText !== 'string') throw new Error('--prompt is required');
  if (!name || typeof name !== 'string') throw new Error('--out is required');

  const providerName = pickProvider(args.provider);
  const provider = PROVIDERS[providerName];
  const model = typeof args.model === 'string' ? args.model : provider.defaultModel;

  const count = Math.max(1, Math.min(provider.maxCount, Number(args.count ?? 1)));
  if (!Number.isInteger(count)) throw new Error('--count takes a whole number');

  const dirKey = typeof args.dir === 'string' ? args.dir : 'assets';
  const directory = DIRECTORIES[dirKey];
  if (!directory) throw new Error(`--dir must be one of ${Object.keys(DIRECTORIES).join(', ')}`);

  const style = args['no-style'] ? '' : typeof args.style === 'string' ? args.style : HOUSE_STYLE;
  const subject = promptText.trim();
  // Punctuate the join, or the subject runs into the style as one sentence and
  // the model reads "a cedar patio planter Natural window light" as a phrase.
  const fullPrompt = style ? `${subject}${/[.!?]$/.test(subject) ? '' : '.'} ${style}` : subject;

  const base = path.basename(name, path.extname(name));
  const targets = count === 1 ? [base] : Array.from({ length: count }, (_, i) => `${base}-${i + 1}`);
  for (const target of targets) {
    const file = path.join(directory, `${target}.webp`);
    if (existsSync(file) && !args.force) {
      throw new Error(`${file} already exists. Pass --force to replace it.`);
    }
  }

  const { url, headers, body } = provider.request(model, fullPrompt, count);

  if (args['dry-run']) {
    console.log(`provider  ${providerName}`);
    console.log(`model     ${model}`);
    console.log(`url       ${url}`);
    console.log(`prompt    ${fullPrompt}`);
    console.log(`body      ${JSON.stringify(body, null, 2)}`);
    console.log(`would write ${targets.map((t) => path.join(directory, `${t}.webp`)).join(', ')}`);
    return;
  }

  const key = process.env[provider.envVar];
  assertHeaderSafe(provider.envVar, key);
  const headerName = Object.keys(headers)[0];

  console.log(`Generating ${count} image(s) with ${providerName}/${model}…`);
  const { status, json, raw } = await postJson({
    url,
    headers: { [headerName]: authHeaderValue(providerName, key) },
    body
  });

  if (status < 200 || status >= 300) throw new Error(describeApiError(status, json, raw));

  const refused = provider.refusal(json);
  if (refused) {
    throw new Error(`The model declined this prompt (${refused}). Rewrite it and try again.`);
  }

  const images = provider.extract(json);
  if (!images.length) {
    throw new Error(
      `The API returned HTTP ${status} but no image data. Response began: ${(raw || '').slice(0, 400)}`
    );
  }

  await mkdir(directory, { recursive: true });
  const rawDir = path.join(DIRECTORIES.assets, 'generated');
  if (!args['no-raw']) await mkdir(rawDir, { recursive: true });

  for (const [index, encoded] of images.slice(0, targets.length).entries()) {
    const target = targets[index];
    const bytes = Buffer.from(encoded, 'base64');

    // Keep the original by default. Generation costs money and is not
    // reproducible from the same prompt, so throwing away the full-resolution
    // frame would make a re-crop mean a re-generation.
    if (!args['no-raw']) {
      await writeFile(path.join(rawDir, `${target}.png`), bytes);
    }

    let rendered;
    try {
      rendered = await renderToSpec(bytes, {
        focus: typeof args.focus === 'string' ? args.focus : undefined,
        grade: args.grade === undefined ? 1 : args.grade,
        budgetKb: args['max-kb'] ?? 400,
        allowUpscale: Boolean(args['allow-upscale'])
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (providerName === 'openai' && message.includes('needs at least')) {
        throw new Error(
          `${message}\n\ngpt-image-1 tops out at 1536x1024, which is below the spec once ` +
            `cropped to 4:3. Either use --provider gemini (Imagen returns 2K at 4:3), or accept ` +
            `a softer frame with --allow-upscale and note it in docs/image-credits.md.`
        );
      }
      throw error;
    }

    const outFile = path.join(directory, `${target}.webp`);
    await writeFile(outFile, rendered.buffer);

    const result = await describe(outFile);
    console.log(
      `Wrote ${outFile}\n` +
        `  from ${rendered.sourceWidth}x${rendered.sourceHeight}  q${rendered.quality}  ` +
        `${result.kb.toFixed(0)} kb  warmth ${result.warmth.toFixed(1)}  ` +
        `saturation ${result.saturation.toFixed(3)}  brightness ${result.brightnessPct.toFixed(1)}%` +
        (rendered.upscaled ? '  (UPSCALED)' : '')
    );
  }

  console.log(
    `\nNext:\n` +
      `  1. Record it in docs/image-credits.md — generated images must be listed as generated,\n` +
      `     with the model and the prompt. The set is otherwise licensed photography.\n` +
      `  2. Add a SHOTS entry in scripts/brand-mockup.config.mjs to place the Hillside mark.\n` +
      `  3. npm run images:mockup -- --only ${base}`
  );
}

const args = parseArgs(process.argv.slice(2));
try {
  await main(args);
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
