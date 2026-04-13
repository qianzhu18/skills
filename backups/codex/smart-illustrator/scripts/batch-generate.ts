#!/usr/bin/env npx -y bun

/**
 * Batch Image Generation Script (Sophnet API only)
 *
 * Generates multiple images from a JSON config file.
 * Supports the unified JSON format (same as web version).
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

const SOPHNET_API_BASE = 'https://www.sophnet.com/api/open-apis/projects/easyllms/imagegenerator/google/models';
const DEFAULT_MODEL = 'gemini-3-pro-image-preview';

interface PictureConfig {
  id: number;
  topic: string;
  content: string;
}

interface BatchRules {
  total: number;
  one_item_one_image?: boolean;
  aspect_ratio?: string;
  do_not_merge?: boolean;
}

interface UnifiedConfig {
  instruction?: string;
  batch_rules?: BatchRules;
  fallback?: string;
  style: string;
  pictures: PictureConfig[];
}

interface LegacyIllustration {
  id: number;
  prompt: string | object;
  filename: string;
  type?: string;
  position?: string;
}

interface LegacyConfig {
  style?: {
    mode?: string;
    background?: string;
    primary?: string;
    accent?: string[];
  };
  instructions?: string;
  illustrations: LegacyIllustration[];
}

type BatchConfig = UnifiedConfig | LegacyConfig;

interface SophnetResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
  }>;
  error?: {
    message: string;
    code: number;
  };
}

function normalizeApiKey(apiKey: string | undefined): string | undefined {
  const normalized = apiKey?.trim().replace(/^\{+|\}+$/g, '');
  return normalized || undefined;
}

function isUnifiedConfig(config: BatchConfig): config is UnifiedConfig {
  return 'pictures' in config && Array.isArray(config.pictures);
}

function buildPromptFromUnified(picture: PictureConfig, style: string): string {
  return `${style}

---

请为以下内容生成一张信息图：

**主题方向**: ${picture.topic}

**内容**:
${picture.content}`;
}

function buildPromptFromLegacy(
  illustration: LegacyIllustration,
  style?: LegacyConfig['style'],
): string {
  let prompt = '';

  if (style) {
    prompt += `Style: ${style.mode || 'light'} mode, `;
    prompt += `background ${style.background || '#F8F9FA'}, `;
    prompt += `primary color ${style.primary || '#2F2B42'}, `;
    if (style.accent) {
      prompt += `accent colors ${style.accent.join(', ')}. `;
    }
  }

  if (typeof illustration.prompt === 'string') {
    prompt += illustration.prompt;
  } else {
    prompt += JSON.stringify(illustration.prompt);
  }

  return prompt;
}

async function generateImage(
  prompt: string,
  model: string,
  apiKey: string,
  aspectRatio?: string,
): Promise<Buffer | null> {
  const url = `${SOPHNET_API_BASE}/${model}:generateContent`;

  const imageConfig: Record<string, string> = {
    imageSize: '2K',
  };
  if (aspectRatio) {
    imageConfig.aspectRatio = aspectRatio;
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `Generate an image: ${prompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json() as SophnetResponse;

  if (data.error) {
    throw new Error(`Sophnet API Error: ${data.error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Sophnet HTTP Error: ${response.status}`);
  }

  if (!data.candidates?.[0]?.content?.parts) {
    return null;
  }

  for (const part of data.candidates[0].content.parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printUsage(): never {
  console.log(`
Batch Image Generation Script (Sophnet API)

Usage:
  npx -y bun batch-generate.ts --config slides.json --output-dir ./images

Options:
  -c, --config <path>       JSON config file (unified format, same as web version)
  -o, --output-dir <path>   Output directory (default: ./illustrations)
  -m, --model <model>       Model to use (default: Sophnet platform image model)
  -d, --delay <ms>          Delay between requests in ms (default: 2000)
  -p, --prefix <text>       Filename prefix (default: from config filename)
  -r, --regenerate <ids>    Regenerate specific images (e.g., "3" or "3,5,7")
  -f, --force               Force regenerate all images (ignore existing)
  -h, --help                Show this help

Environment:
  SOPHNET_API_KEY           Required. Used for all batch image generation requests
`);
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  let configPath: string | null = null;
  let outputDir = './illustrations';
  let model = DEFAULT_MODEL;
  let delay = 2000;
  let prefix: string | null = null;
  let forceRegenerate = false;
  let regenerateIds: Set<number> | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-h':
      case '--help':
        printUsage();
        break;
      case '-c':
      case '--config':
        configPath = args[++i];
        break;
      case '-o':
      case '--output-dir':
        outputDir = args[++i];
        break;
      case '-m':
      case '--model':
        model = args[++i];
        break;
      case '-d':
      case '--delay':
        delay = parseInt(args[++i], 10);
        break;
      case '--provider':
        console.error('Error: --provider has been removed. Smart Illustrator now only uses Sophnet.');
        process.exit(1);
      case '-p':
      case '--prefix':
        prefix = args[++i];
        break;
      case '-f':
      case '--force':
        forceRegenerate = true;
        break;
      case '-r':
      case '--regenerate':
        regenerateIds = new Set(args[++i].split(',').map(id => parseInt(id.trim(), 10)));
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Error: Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  const apiKey = normalizeApiKey(process.env.SOPHNET_API_KEY);
  if (!apiKey) {
    console.error('Error: SOPHNET_API_KEY environment variable is required');
    process.exit(1);
  }

  if (!configPath) {
    console.error('Error: --config is required');
    process.exit(1);
  }

  const configContent = await readFile(configPath, 'utf-8');
  const config: BatchConfig = JSON.parse(configContent);

  if (!prefix) {
    prefix = basename(configPath, '.json').replace(/-slides$/, '');
  }

  await mkdir(outputDir, { recursive: true });

  const batchAspectRatio = isUnifiedConfig(config) ? config.batch_rules?.aspect_ratio : undefined;

  if (isUnifiedConfig(config)) {
    const total = config.pictures.length;
    let success = 0;
    let failed = 0;
    let skipped = 0;

    console.log(`\nBatch Image Generation (Unified Format)`);
    console.log(`=======================================`);
    console.log(`Provider: sophnet`);
    console.log(`Model: ${model}`);
    console.log(`Total: ${total} images`);
    console.log(`Prefix: ${prefix}`);
    console.log(`Output: ${outputDir}`);
    console.log(`Delay: ${delay}ms between requests`);
    if (forceRegenerate) {
      console.log(`Mode: Force regenerate all`);
    } else if (regenerateIds) {
      console.log(`Mode: Regenerate specific IDs: ${[...regenerateIds].join(', ')}`);
    } else {
      console.log(`Mode: Resume (skip existing)`);
    }
    console.log();

    let needsDelay = false;

    for (const picture of config.pictures) {
      const filename = `${prefix}-${String(picture.id).padStart(2, '0')}.png`;
      const outputPath = join(outputDir, filename);

      const fileExists = existsSync(outputPath);
      const shouldRegenerate = regenerateIds?.has(picture.id);
      const shouldSkip = fileExists && !forceRegenerate && !shouldRegenerate;

      if (shouldSkip) {
        console.log(`[${picture.id}/${total}] Skipping: ${filename} (already exists)`);
        skipped++;
        continue;
      }

      if (needsDelay) {
        console.log(`  Waiting ${delay}ms...`);
        await sleep(delay);
      }

      console.log(`[${picture.id}/${total}] Generating: ${filename}`);
      console.log(`  Topic: ${picture.topic}`);
      if (shouldRegenerate) {
        console.log(`  (Regenerating as requested)`);
      }

      try {
        const prompt = buildPromptFromUnified(picture, config.style);
        const imageBuffer = await generateImage(prompt, model, apiKey, batchAspectRatio);

        if (imageBuffer) {
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, imageBuffer);
          console.log(`  ✓ Saved (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
          success++;
        } else {
          console.log(`  ✗ No image generated`);
          failed++;
        }
      } catch (error) {
        console.log(`  ✗ Error: ${error instanceof Error ? error.message : error}`);
        failed++;
      }

      needsDelay = true;
    }

    console.log(`\n=======================================`);
    if (skipped > 0) {
      console.log(`Complete: ${success} generated, ${skipped} skipped, ${failed} failed`);
    } else {
      console.log(`Complete: ${success}/${total} succeeded, ${failed} failed`);
    }
    console.log(`Output directory: ${outputDir}`);
  } else {
    const legacyConfig = config as LegacyConfig;

    if (!legacyConfig.illustrations || legacyConfig.illustrations.length === 0) {
      console.error('Error: No illustrations in config');
      process.exit(1);
    }

    const total = legacyConfig.illustrations.length;
    let success = 0;
    let failed = 0;
    let skipped = 0;

    console.log(`\nBatch Image Generation (Legacy Format)`);
    console.log(`======================================`);
    console.log(`Provider: sophnet`);
    console.log(`Model: ${model}`);
    console.log(`Total: ${total} images`);
    console.log(`Output: ${outputDir}`);
    if (forceRegenerate) {
      console.log(`Mode: Force regenerate all`);
    } else if (regenerateIds) {
      console.log(`Mode: Regenerate specific IDs: ${[...regenerateIds].join(', ')}`);
    } else {
      console.log(`Mode: Resume (skip existing)`);
    }
    console.log();

    let needsDelay = false;

    for (const illustration of legacyConfig.illustrations) {
      const outputPath = join(outputDir, illustration.filename);

      const fileExists = existsSync(outputPath);
      const shouldRegenerate = regenerateIds?.has(illustration.id);
      const shouldSkip = fileExists && !forceRegenerate && !shouldRegenerate;

      if (shouldSkip) {
        console.log(`[${illustration.id}/${total}] Skipping: ${illustration.filename} (already exists)`);
        skipped++;
        continue;
      }

      if (needsDelay) {
        await sleep(delay);
      }

      console.log(`[${illustration.id}/${total}] Generating: ${illustration.filename}`);
      if (shouldRegenerate) {
        console.log(`  (Regenerating as requested)`);
      }

      try {
        const prompt = buildPromptFromLegacy(illustration, legacyConfig.style);
        const imageBuffer = await generateImage(prompt, model, apiKey);

        if (imageBuffer) {
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, imageBuffer);
          console.log(`  ✓ Saved (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
          success++;
        } else {
          console.log(`  ✗ No image generated`);
          failed++;
        }
      } catch (error) {
        console.log(`  ✗ Error: ${error instanceof Error ? error.message : error}`);
        failed++;
      }

      needsDelay = true;
    }

    console.log(`\n======================================`);
    if (skipped > 0) {
      console.log(`Complete: ${success} generated, ${skipped} skipped, ${failed} failed`);
    } else {
      console.log(`Complete: ${success}/${total} succeeded, ${failed} failed`);
    }
    console.log(`Output directory: ${outputDir}`);
  }
}

main();
