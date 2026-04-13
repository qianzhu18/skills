#!/usr/bin/env npx -y bun

/**
 * Image Generation Script (Sophnet API only)
 *
 * Usage:
 *   npx -y bun ~/.claude/skills/smart-illustrator/scripts/generate-image.ts --prompt "A cute cat" --output cat.png
 *   npx -y bun ~/.claude/skills/smart-illustrator/scripts/generate-image.ts --prompt-file prompt.md --output image.png
 *
 * Style-lock (reference images):
 *   npx -y bun generate-image.ts --prompt "..." --ref style-ref.png --output image.png
 *
 * Environment:
 *   SOPHNET_API_KEY - Sophnet API key
 *
 * Models:
 *   Sophnet platform default image model
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { loadConfig, saveConfig, mergeConfig, type Config } from './config.js';
import { analyzeCoverImage, saveLearning, getLearningsPrompt, loadLearnings } from './cover-learner.js';

interface ReferenceImage {
  mimeType: string;
  base64: string;
}

const SOPHNET_API_BASE = 'https://www.sophnet.com/api/open-apis/projects/easyllms/imagegenerator/google/models';
const DEFAULT_SOPHNET_MODEL = 'gemini-3-pro-image-preview';

type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';

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

async function loadReferenceImages(paths: string[]): Promise<ReferenceImage[]> {
  const images: ReferenceImage[] = [];

  for (const imagePath of paths.slice(0, 3)) {
    const absolutePath = isAbsolute(imagePath) ? imagePath : resolve(process.cwd(), imagePath);

    try {
      const buffer = await readFile(absolutePath);
      const ext = extname(imagePath).toLowerCase();
      const mimeType = ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/png';

      images.push({
        mimeType,
        base64: buffer.toString('base64'),
      });

      console.log(`Loaded reference image: ${imagePath} (${(buffer.length / 1024).toFixed(1)} KB)`);
    } catch {
      console.error(`Warning: Failed to load reference image: ${imagePath}`);
    }
  }

  return images;
}

async function loadVariedStyleHints(): Promise<[string, string]> {
  const promptsDir = resolve(dirname(new URL(import.meta.url).pathname), '../prompts');
  const variedStylesPath = resolve(promptsDir, 'varied-styles.md');

  try {
    const content = await readFile(variedStylesPath, 'utf-8');

    const candidate1Match = content.match(/## Candidate 1:[\s\S]*?\n\n(\*\*风格提示[\s\S]*?)(?=\n\n##)/);
    const candidate1 = candidate1Match
      ? '\n\n' + candidate1Match[1].trim()
      : '\n\n**风格提示（Candidate 1）**：dramatic & high-contrast（戏剧性高对比）\n- 使用强烈的明暗对比\n- 情绪张力强\n- 视觉冲击力优先';

    const candidate2Match = content.match(/## Candidate 2:[\s\S]*?\n\n(\*\*风格提示[\s\S]*?)(?=\n\n---)/);
    const candidate2 = candidate2Match
      ? '\n\n' + candidate2Match[1].trim()
      : '\n\n**风格提示（Candidate 2）**：minimal & professional（极简专业）\n- 极简构图，留白充足\n- 专业、克制、高级感\n- 信息清晰优先';

    return [candidate1, candidate2];
  } catch {
    console.warn('Warning: Failed to load varied style hints, using defaults');
    return [
      '\n\n**风格提示（Candidate 1）**：dramatic & high-contrast（戏剧性高对比）\n- 使用强烈的明暗对比\n- 情绪张力强\n- 视觉冲击力优先',
      '\n\n**风格提示（Candidate 2）**：minimal & professional（极简专业）\n- 极简构图，留白充足\n- 专业、克制、高级感\n- 信息清晰优先',
    ];
  }
}

async function generateImageSophnet(
  prompt: string,
  model: string,
  apiKey: string,
  size: 'default' | '2k' = 'default',
  references: ReferenceImage[] = [],
  aspectRatio?: AspectRatio,
): Promise<{ imageData: Buffer; mimeType: string } | null> {
  const url = `${SOPHNET_API_BASE}/${model}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    responseModalities: ['IMAGE', 'TEXT'],
  };

  const imageConfig: Record<string, string> = {};
  if (size === '2k') {
    imageConfig.imageSize = '2K';
  }
  if (aspectRatio) {
    imageConfig.aspectRatio = aspectRatio;
  }
  if (Object.keys(imageConfig).length > 0) {
    generationConfig.imageConfig = imageConfig;
  }

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (references.length > 0) {
    parts.push({
      text: '以下图片是风格参考。请匹配它们的视觉风格、色彩搭配和艺术手法：',
    });

    for (const ref of references) {
      parts.push({
        inlineData: {
          mimeType: ref.mimeType,
          data: ref.base64,
        },
      });
    }

    parts.push({
      text: '---\n请按照上述风格生成新图片：',
    });
  }

  parts.push({ text: prompt });

  const requestBody = {
    contents: [{ parts }],
    generationConfig,
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
    throw new Error(`Sophnet API Error: ${data.error.message} (code: ${data.error.code})`);
  }

  if (!response.ok) {
    throw new Error(`Sophnet HTTP Error: ${response.status}`);
  }

  if (!data.candidates?.[0]?.content?.parts) {
    throw new Error('No content in response');
  }

  for (const part of data.candidates[0].content.parts) {
    if (part.inlineData?.data) {
      return {
        imageData: Buffer.from(part.inlineData.data, 'base64'),
        mimeType: part.inlineData.mimeType,
      };
    }
  }

  return null;
}

function printUsage(): never {
  console.log(`
Image Generation Script (Sophnet API)

Usage:
  npx -y bun generate-image.ts --prompt "description" --output image.png
  npx -y bun generate-image.ts --prompt-file prompt.md --output image.png

Options:
  -p, --prompt <text>         Image description
  -f, --prompt-file <path>    Read prompt from file
  -o, --output <path>         Output image path (default: generated.png)
  -m, --model <model>         Model to use (default: Sophnet platform image model)
  --size <size>               Image size: 2k (2048px, default) or default (~1.4K)
  -a, --aspect-ratio <ratio>  Aspect ratio: 1:1, 3:4, 4:3, 9:16, 16:9, 21:9, etc.
  -h, --help                  Show this help

Style-lock Options (reference images):
  -r, --ref <path>            Reference image for style (can use multiple, max 3)
  --ref-weight <0-1>          Reference image weight (default: 1.0, not yet implemented)

Quality Router Options (multi-candidate generation):
  -c, --candidates <n>        Generate multiple candidates (default: 1, max: 4)
                              Output files: output-1.png, output-2.png, etc.

Style Configuration (persistent settings):
  --save-config               Save current settings to project config (.smart-illustrator/config.json)
  --save-config-global        Save current settings to user config (~/.smart-illustrator/config.json)
  --no-config                 Ignore config files, use only command-line arguments

Cover Learning:
  --learn-cover <path>        Analyze a cover image and save learnings
  --learn-note <text>         Note for the learning (e.g., "CTR 8.5%")
  --show-learnings            Show current cover learnings
  --varied                    Generate varied styles (2 candidates with different approaches)

Environment Variables:
  SOPHNET_API_KEY             Required. Used for all image generation requests
`);
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  let prompt: string | null = null;
  let promptFile: string | null = null;
  let output = 'generated.png';
  let model: string | null = null;
  let size: 'default' | '2k' = '2k';
  let aspectRatio: AspectRatio | undefined;
  const refPaths: string[] = [];
  let candidates = 1;
  let shouldSaveConfig = false;
  let saveConfigGlobal = false;
  let noConfig = false;
  let learnCoverPath: string | null = null;
  let learnNote: string | null = null;
  let showLearnings = false;
  let variedMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-h':
      case '--help':
        printUsage();
        break;
      case '-p':
      case '--prompt':
        prompt = args[++i];
        break;
      case '-f':
      case '--prompt-file':
        promptFile = args[++i];
        break;
      case '-o':
      case '--output':
        output = args[++i];
        break;
      case '-m':
      case '--model':
        model = args[++i];
        break;
      case '--provider':
        console.error('Error: --provider has been removed. Smart Illustrator now only uses Sophnet.');
        process.exit(1);
      case '--size':
        size = args[++i] as 'default' | '2k';
        break;
      case '--aspect-ratio':
      case '-a':
        aspectRatio = args[++i] as AspectRatio;
        break;
      case '-r':
      case '--ref':
      case '--reference':
        refPaths.push(args[++i]);
        break;
      case '--ref-weight':
        i++;
        break;
      case '-c':
      case '--candidates':
        candidates = Math.min(4, Math.max(1, parseInt(args[++i], 10) || 1));
        break;
      case '--save-config':
        shouldSaveConfig = true;
        break;
      case '--save-config-global':
        shouldSaveConfig = true;
        saveConfigGlobal = true;
        break;
      case '--no-config':
        noConfig = true;
        break;
      case '--learn-cover':
        learnCoverPath = args[++i];
        break;
      case '--learn-note':
        learnNote = args[++i];
        break;
      case '--show-learnings':
        showLearnings = true;
        break;
      case '--varied':
        variedMode = true;
        candidates = 2;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Error: Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  if (showLearnings) {
    const learnings = await loadLearnings();
    if (!learnings) {
      console.log('No cover learnings found yet.');
      console.log('Learn from a high-performing cover:');
      console.log('  npx -y bun generate-image.ts --learn-cover my-best-thumbnail.png');
    } else {
      const { readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { homedir } = await import('node:os');
      const learningsPath = join(homedir(), '.smart-illustrator', 'cover-learnings.md');
      const content = await readFile(learningsPath, 'utf-8');
      console.log(content);
    }
    process.exit(0);
  }

  if (learnCoverPath) {
    console.log('Analyzing cover image...');
    const analysis = await analyzeCoverImage(learnCoverPath, learnNote || undefined);
    if (analysis) {
      await saveLearning(analysis);
      console.log('\n✓ Learning completed successfully!');
      console.log('\nNext time you generate a cover, these learnings will be automatically applied.');
    } else {
      console.error('Failed to analyze cover image');
      process.exit(1);
    }
    process.exit(0);
  }

  let loadedConfig: Config = {};
  if (!noConfig) {
    try {
      loadedConfig = loadConfig(process.cwd());
    } catch (error) {
      console.warn('Warning: Failed to load config:', error);
    }
  }

  const finalConfig = mergeConfig(loadedConfig, {
    references: refPaths.length > 0 ? refPaths : undefined,
  });

  if (finalConfig.references && finalConfig.references.length > 0 && refPaths.length === 0) {
    refPaths.push(...finalConfig.references);
    console.log(`Using ${finalConfig.references.length} reference image(s) from config`);
  }

  const apiKey = normalizeApiKey(process.env.SOPHNET_API_KEY);
  if (!apiKey) {
    console.error('Error: SOPHNET_API_KEY is required');
    process.exit(1);
  }

  if (!model) {
    model = DEFAULT_SOPHNET_MODEL;
  }

  if (promptFile) {
    prompt = await readFile(promptFile, 'utf-8');
  }

  if (!prompt) {
    console.error('Error: --prompt or --prompt-file is required');
    process.exit(1);
  }

  const isCoverGeneration = prompt.toLowerCase().includes('cover')
    || prompt.includes('封面')
    || prompt.includes('youtube')
    || prompt.includes('thumbnail');

  if (isCoverGeneration) {
    const learningsPrompt = await getLearningsPrompt();
    if (learningsPrompt) {
      prompt += learningsPrompt;
      console.log('✓ Applied cover learnings from history');
    }
  }

  console.log('Provider: sophnet');
  console.log(`Model: ${model}`);
  console.log(`Size: ${size}`);
  if (aspectRatio) {
    console.log(`Aspect ratio: ${aspectRatio}`);
  }
  if (refPaths.length > 0) {
    console.log(`Reference images: ${refPaths.length}`);
  }
  if (candidates > 1) {
    console.log(`Candidates: ${candidates}`);
  }
  console.log(`Prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`);

  try {
    const references = refPaths.length > 0 ? await loadReferenceImages(refPaths) : [];

    await mkdir(dirname(output), { recursive: true });

    const generatedFiles: string[] = [];
    const ext = extname(output);
    const baseName = output.slice(0, -ext.length);

    for (let i = 1; i <= candidates; i++) {
      const candidateOutput = candidates > 1 ? `${baseName}-${i}${ext}` : output;

      let finalPrompt = prompt;
      if (variedMode && isCoverGeneration) {
        const styleHints = await loadVariedStyleHints();
        finalPrompt = prompt + (styleHints[i - 1] || styleHints[0]);
        console.log(candidates > 1 ? `\nGenerating candidate ${i}/${candidates} (${i === 1 ? 'Dramatic' : 'Minimal'})...` : '\nGenerating image...');
      } else {
        console.log(candidates > 1 ? `\nGenerating candidate ${i}/${candidates}...` : '\nGenerating image...');
      }

      const result = await generateImageSophnet(finalPrompt, model, apiKey, size, references, aspectRatio);
      if (!result) {
        console.error(`Error: No image generated for candidate ${i}`);
        continue;
      }

      await writeFile(candidateOutput, result.imageData);
      generatedFiles.push(candidateOutput);
      console.log(`✓ Saved: ${candidateOutput} (${(result.imageData.length / 1024).toFixed(1)} KB)`);
    }

    if (generatedFiles.length === 0) {
      console.error('Error: No images were generated');
      process.exit(1);
    }

    if (candidates > 1) {
      console.log(`\n=== Quality Router: ${generatedFiles.length} candidates generated ===`);
      generatedFiles.forEach((f, idx) => console.log(`  ${idx + 1}. ${f}`));
      console.log('\nReview the candidates and select the best one.');
    }

    if (shouldSaveConfig && generatedFiles.length > 0) {
      const configToSave: Config = {
        references: refPaths.length > 0 ? refPaths : undefined,
      };

      saveConfig(configToSave, {
        global: saveConfigGlobal,
        cwd: process.cwd(),
      });

      console.log(`\n✓ Config saved to ${saveConfigGlobal ? 'user' : 'project'} config`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
