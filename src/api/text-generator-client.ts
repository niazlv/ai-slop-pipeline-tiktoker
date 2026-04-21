import OpenAI from 'openai';
import { ReferenceImage } from '../types/video-step';

export interface PromptMapping {
  prompt: string;
  referenceImageIndex?: number | null;
  referenceAction?: 'direct_use' | 'img2img' | null;
}

export interface TextGenerationResult {
  text: string;
  variant: number;
}

export class TextGeneratorClient {
  private client: OpenAI;
  private model: string;

  constructor(useFreeModel: boolean = false) {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    this.model = useFreeModel
      ? (process.env.OPENROUTER_MODEL_FREE || 'x-ai/grok-4.1-fast:free')
      : (process.env.OPENROUTER_MODEL || 'openai/chagpt');

    console.log(`📝 Using text model: ${this.model}${useFreeModel ? ' (FREE)' : ''}`);
  }

  private detectLanguage(text: string): 'ru' | 'en' {
    // Simple Cyrillic detection
    const cyrillicPattern = /[\u0400-\u04FF]/;
    return cyrillicPattern.test(text) ? 'ru' : 'en';
  }

  private getLanguageInstructions(language: 'ru' | 'en'): string {
    if (language === 'ru') {
      return 'Пиши историю на русском языке';
    }
    return 'Write the story in English';
  }

  async generateStoryVariants(description: string, duration: number = 60): Promise<TextGenerationResult[]> {
    const startTime = Date.now();

    console.log('\n' + '='.repeat(60));
    console.log('📝  TEXT VARIANT GENERATION');
    console.log('='.repeat(60));
    console.log('📥 Description:', description);
    console.log('⏱️  Duration:', duration, 'seconds');

    // Detect language from description
    const language = this.detectLanguage(description);
    const languageInstruction = this.getLanguageInstructions(language);
    console.log('🌐 Detected language:', language);

    // Calculate word count (150 words per minute)
    const wordsCount = Math.floor((duration / 60) * 150);

    const systemPrompt = `You are a creative screenwriter for short videos.
Your task is to create an engaging story for a ${duration}-second video based on the user's description.

REQUIREMENTS:
- The text should be approximately ${duration} seconds of narration (about ${wordsCount} words)
- The text should be dynamic, interesting, and suitable for a short video
- Use vivid visual imagery that can be easily conveyed in video
- The text should be coherent and have a clear structure
- Use dramatic structure: exposition, rising action, climax, resolution
- ${languageInstruction}

RESPONSE FORMAT:
Return only the clean story text, without additional explanations or markup.`;

    console.log('\n🚀 PARALLEL generation of 3 variants...');

    // Generate all variants in parallel
    const variantPromises = [0, 1, 2].map(async (i) => {
      const variantStart = Date.now();
      console.log(`🔄 Starting variant ${i + 1}/3 generation...`);

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: description }],
        temperature: 0.9 + i * 0.1, // Разная температура для большего разнообразия
        max_tokens: 800,
      });

      const text = response.choices[0]?.message?.content?.trim() || '';
      const variantTime = ((Date.now() - variantStart) / 1000).toFixed(1);

      console.log(`✅ Variant ${i + 1} generated (${text.length} characters) - ${variantTime}s`);

      return {
        text,
        variant: i + 1,
      };
    });

    const variants = await Promise.all(variantPromises);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n📤 Generated variants:', variants.length);
    console.log(`⏱️  Total time: ${totalTime}s`);
    console.log('='.repeat(60) + '\n');

    return variants;
  }


  async generateVideoPrompts(storyText: string, duration: number = 60, referenceImages: ReferenceImage[] = []): Promise<PromptMapping[]> {
    const startTime = Date.now();

    console.log('\n' + '='.repeat(60));
    console.log('🎬  VIDEO PROMPT GENERATION');
    console.log('='.repeat(60));
    console.log('📥 Text length:', storyText.length, 'characters');
    console.log('⏱️  Video duration:', duration, 'seconds');

    // Use short 4-second segments for more dynamic video
    const segmentDuration = 4;
    const segmentCount = Math.ceil(duration / segmentDuration);

    console.log('📊 Segment count:', segmentCount);
    console.log('⏱️  Segment duration:', segmentDuration, 'seconds');

const systemPrompt = `You are an expert at creating prompts for AI video generation.
Your task is to split the story text into segments and create visual prompts for each segment.

CRITICAL HARD RULE: DO NOT ask the image/video generator to render specific text, words, brand names, or letters (e.g., DO NOT write 'a sign that says "Cafe"', or 'logo with text "Brand"'). AI models cannot render text accurately and will output gibberish slop. If a logo or sign is needed, describe the visual composition and shapes only, without explicit words.

REQUIREMENTS:
- Divide the text into ${segmentCount} segments (${segmentDuration} seconds each for a ${duration}-second video)
- For each segment, create a detailed visual prompt for video generation
- Prompts must be in English
- Each prompt should describe a specific visual scene
- Use cinematic terms: camera angle, lighting, movement, composition
- Prompts should be consistent with each other (unified style, characters, locations)
${referenceImages.length > 0 ? `
REFERENCE IMAGES:
You have access to the following reference images provided by the user:
${JSON.stringify(referenceImages.map(img => ({ id: img.id, description: img.description })), null, 2)}
You can map a reference image to a segment by specifying its ID in "referenceImageIndex".
You MUST choose a "referenceAction":
- "direct_use": The video generator will use this exact image WITHOUT modifying it. PERFECT for logos, app screens, or exact banners at the end of the video.
- "img2img": The image generator will use this image as a base and modify it heavily based on your text prompt. PERFECT for character faces or retaining styles during active scenes.
If no reference is needed for a scene, pass null for both.
` : ''}

RESPONSE FORMAT:
Return only a JSON array of EXACTLY ${segmentCount} objects:
[
  {
    "prompt": "Cinematic shot of a truck driver at sunset, warm golden hour lighting...",
    "referenceImageIndex": null,
    "referenceAction": null
  }
]`;

    console.log('\n🔄 Generating prompts...');

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Story text:\n\n${storyText}` },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content?.trim() || '[]';

    // Extract JSON from response (may be in markdown block)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const jsonString = jsonMatch ? jsonMatch[0] : content;

    const prompts: PromptMapping[] = JSON.parse(jsonString);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Generated prompts: ${prompts.length} - ${totalTime}s`);
    prompts.forEach((p, i) => {
      console.log(`\n  ${i + 1}. ${p.prompt.substring(0, 80)}...`);
      if (p.referenceImageIndex !== null && p.referenceImageIndex !== undefined) {
        console.log(`     🖼️  Mapped reference #${p.referenceImageIndex} [${p.referenceAction}]`);
      }
    });
    console.log('='.repeat(60) + '\n');

    return prompts;
  }

  async regenerateSingleVariant(description: string, duration: number, temperature: number = 0.9): Promise<string> {
    const wordsCount = Math.floor((duration / 60) * 150);

    // Detect language from description
    const language = this.detectLanguage(description);
    const languageInstruction = this.getLanguageInstructions(language);

    const systemPrompt = `You are a creative screenwriter for short videos.
Your task is to create an engaging story for a ${duration}-second video based on the user's description.

REQUIREMENTS:
- The text should be approximately ${duration} seconds of narration (about ${wordsCount} words)
- The text should be dynamic, interesting, and suitable for a short video
- Use vivid visual imagery that can be easily conveyed in video
- The text should be coherent and have a clear structure
- Use dramatic structure: exposition, rising action, climax, resolution
- ${languageInstruction}

RESPONSE FORMAT:
Return only the clean story text, without additional explanations or markup.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: description }],
      temperature,
      max_tokens: 800,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }

  async modifyVariant(originalText: string, modificationPrompt: string, duration: number): Promise<string> {
    const wordsCount = Math.floor((duration / 60) * 150);

    // Detect language from original text
    const language = this.detectLanguage(originalText);
    const languageInstruction = this.getLanguageInstructions(language);

    const systemPrompt = `You are a creative screenwriter for short videos.
Your task is to modify an existing story based on the user's request.

REQUIREMENTS:
- The text should be approximately ${duration} seconds of narration (about ${wordsCount} words)
- Keep the general structure and flow unless asked to change it
- Apply the user's requested modifications
- The text should remain dynamic, interesting, and suitable for a short video
- Use vivid visual imagery that can be easily conveyed in video
- ${languageInstruction}

RESPONSE FORMAT:
Return only the modified story text, without additional explanations or markup.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Original story:\n${originalText}\n\nModification request: ${modificationPrompt}` },
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }
}
