import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ReferenceImage } from '../types/video-step';
import { logger } from '../bot/logger';

export interface PromptMapping {
  prompt: string;
  referenceImageIndex?: number | null;
  referenceAction?: 'direct_use' | 'img2img' | null;
}

export interface TextGenerationResult {
  text: string;
  variant: number;
}

export interface FallbackConfig {
  requestType: 'story' | 'prompts' | 'regenerate' | 'modify';
  primaryModels: string[];
  fallbackModels: string[];
  maxRetries: number;
}

export interface ProviderConfig {
  name: string;
  type: 'openrouter' | 'gemini';
  models: string[];
  priority: number;
}

export class TextGeneratorClient {
  private openRouterClient: OpenAI;
  private geminiClient: GoogleGenerativeAI | null;
  private model: string;
  private fallbackConfigs: Map<string, FallbackConfig> = new Map();
  private providers: ProviderConfig[] = [];

  constructor(useFreeModel: boolean = false) {
    // Initialize OpenRouter client
    this.openRouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    // Initialize Gemini client if API key is available
    this.geminiClient = process.env.GOOGLE_GEMINI_API_KEY 
      ? new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)
      : null;

    this.model = useFreeModel
      ? (process.env.OPENROUTER_MODEL_FREE || 'x-ai/grok-4.1-fast:free')
      : (process.env.OPENROUTER_MODEL || 'openai/chagpt');

    // Initialize fallback configurations
    this.initializeFallbackConfigs();
    
    // Initialize provider configurations
    this.initializeProviders();

    console.log(`📝 Using text model: ${this.model}${useFreeModel ? ' (FREE)' : ''}`);
  }

  private isGeminiModel(model: string): boolean {
    return model.includes('gemini') || model.startsWith('google/');
  }

  private initializeFallbackConfigs(): void {
    this.fallbackConfigs = new Map();

    // Parse environment variables for fallback configuration
    const parseModelList = (envVar: string, defaultValue: string[]): string[] => {
      const envValue = process.env[envVar];
      if (envValue) {
        return envValue.split(',').map(model => model.trim()).filter(model => model.length > 0);
      }
      return defaultValue;
    };

    const maxRetries = parseInt(process.env.FALLBACK_MAX_RETRIES || '6', 10);

    // Story generation fallback configuration
    // IMPORTANT: x-ai/grok-4.1-fast is the primary working model - always first
    this.fallbackConfigs.set('story', {
      requestType: 'story',
      primaryModels: parseModelList('FALLBACK_STORY_PRIMARY', [
        // Working OpenRouter models first (these actually work)
        'x-ai/grok-4.1-fast',
        // Direct Gemini API - gemini-2.5-flash is current stable model
        'gemini-2.5-flash',
        // Additional OpenRouter fallbacks
        'anthropic/claude-3-haiku',
      ]),
      fallbackModels: parseModelList('FALLBACK_STORY_FALLBACK', [
        'meta-llama/llama-3.1-8b-instruct:free',
        'mistralai/mistral-7b-instruct:free'
      ]),
      maxRetries: maxRetries
    });

    // Video prompts generation fallback configuration
    this.fallbackConfigs.set('prompts', {
      requestType: 'prompts',
      primaryModels: parseModelList('FALLBACK_PROMPTS_PRIMARY', [
        'x-ai/grok-4.1-fast',
        'gemini-2.5-flash',
        'anthropic/claude-3-haiku',
      ]),
      fallbackModels: parseModelList('FALLBACK_PROMPTS_FALLBACK', [
        'meta-llama/llama-3.1-8b-instruct:free',
        'mistralai/mistral-7b-instruct:free'
      ]),
      maxRetries: maxRetries
    });

    // Single variant regeneration fallback configuration
    this.fallbackConfigs.set('regenerate', {
      requestType: 'regenerate',
      primaryModels: parseModelList('FALLBACK_STORY_PRIMARY', [
        'x-ai/grok-4.1-fast',
        'gemini-2.5-flash',
        'anthropic/claude-3-haiku',
      ]),
      fallbackModels: parseModelList('FALLBACK_STORY_FALLBACK', [
        'meta-llama/llama-3.1-8b-instruct:free',
      ]),
      maxRetries: maxRetries
    });

    // Variant modification fallback configuration
    this.fallbackConfigs.set('modify', {
      requestType: 'modify',
      primaryModels: parseModelList('FALLBACK_STORY_PRIMARY', [
        'x-ai/grok-4.1-fast',
        'gemini-2.5-flash',
        'anthropic/claude-3-haiku',
      ]),
      fallbackModels: parseModelList('FALLBACK_STORY_FALLBACK', [
        'meta-llama/llama-3.1-8b-instruct:free',
      ]),
      maxRetries: maxRetries
    });

    // Log fallback configuration for debugging
    console.log('🔄 Fallback configuration loaded:');
    console.log(`   Max retries: ${maxRetries}`);
    console.log(`   Story primary: ${this.fallbackConfigs.get('story')?.primaryModels.join(', ')}`);
    console.log(`   Story fallback: ${this.fallbackConfigs.get('story')?.fallbackModels.join(', ')}`);
  }

  private initializeProviders(): void {
    this.providers = [
      {
        name: 'Google Gemini',
        type: 'gemini',
        models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-pro'],
        priority: 1
      },
      {
        name: 'OpenRouter',
        type: 'openrouter',
        models: [
          'openai/gpt-4',
          'openai/gpt-4-turbo',
          'openai/gpt-3.5-turbo',
          'x-ai/grok-4.1-fast',
          'anthropic/claude-3-sonnet',
          'anthropic/claude-3-haiku',
          'meta-llama/llama-3.1-8b-instruct',
          'mistralai/mistral-7b-instruct'
        ],
        priority: 2
      }
    ];
  }

  private getProviderForModel(model: string): ProviderConfig | null {
    return this.providers.find(provider => 
      provider.models.some(m => model.includes(m) || m.includes(model))
    ) || null;
  }

  private async generateWithFallback(
    requestType: 'story' | 'prompts' | 'regenerate' | 'modify',
    generateFn: (model: string) => Promise<string>,
    originalModel?: string
  ): Promise<string> {
    const config = this.fallbackConfigs.get(requestType);
    if (!config) {
      throw new Error(`No fallback configuration found for request type: ${requestType}`);
    }

    const modelToUse = originalModel || this.model;
    const allModels = [modelToUse, ...config.primaryModels, ...config.fallbackModels];
    
    // Remove duplicates while preserving order
    const uniqueModels = Array.from(new Set(allModels));
    
    let lastError: Error | null = null;
    let attemptCount = 0;

    for (const model of uniqueModels) {
      if (attemptCount >= config.maxRetries + 1) {
        break;
      }

      attemptCount++;
      const provider = this.getProviderForModel(model);
      
      const requestContext = {
        requestType,
        attempt: attemptCount,
        model,
        provider: provider?.name || 'unknown',
        providerType: provider?.type || 'unknown',
        timestamp: new Date().toISOString(),
        totalModelsAvailable: uniqueModels.length
      };

      logger.info(`Attempting text generation with fallback`, requestContext);

      try {
        const result = await generateFn(model);
        
        logger.info(`Text generation successful with fallback`, {
          ...requestContext,
          success: true,
          resultLength: result.length,
          fallbackUsed: attemptCount > 1
        });

        if (attemptCount > 1) {
          console.log(`🔄 Fallback successful: switched from ${modelToUse} to ${model} (attempt ${attemptCount})`);
        }

        return result;
      } catch (error: any) {
        lastError = error;
        
        const errorDetails = {
          ...requestContext,
          error: {
            message: error.message || 'Unknown error',
            name: error.name || 'UnknownError',
            code: error.code || 'UNKNOWN_CODE',
            status: error.status || error.statusCode || 'UNKNOWN_STATUS'
          },
          success: false
        };

        logger.error(`Text generation failed, trying fallback`, errorDetails);
        console.log(`❌ Model ${model} failed (attempt ${attemptCount}/${config.maxRetries + 1}): ${error.message}`);
        
        // Continue to next model
        continue;
      }
    }

    // All models failed
    const finalError = new Error(
      `All fallback models failed for ${requestType}. Last error: ${lastError?.message || 'Unknown error'}`
    ) as Error & { cause?: any };
    finalError.cause = lastError;

    logger.error(`All fallback models exhausted for ${requestType}`, {
      requestType,
      totalAttempts: attemptCount,
      modelsAttempted: uniqueModels.slice(0, attemptCount),
      finalError: finalError.message,
      timestamp: new Date().toISOString()
    });

    throw finalError;
  }

  private async generateWithGemini(prompt: string, systemPrompt: string, temperature: number = 0.9, modelName: string = 'gemini-2.5-flash'): Promise<string> {
    if (!this.geminiClient) {
      const error = new Error('Google Gemini API key not configured');
      logger.error('Gemini API initialization failed', {
        model: modelName,
        provider: 'google-gemini',
        error: error.message,
        timestamp: new Date().toISOString(),
        context: 'API_KEY_MISSING'
      });
      throw error;
    }

    const requestContext = {
      model: modelName,
      provider: 'google-gemini',
      temperature,
      maxOutputTokens: 800,
      promptLength: prompt.length,
      systemPromptLength: systemPrompt.length,
      timestamp: new Date().toISOString()
    };

    logger.info('Starting Gemini API request', requestContext);

    try {
      const model = this.geminiClient.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: 800,
        }
      });

      const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const generatedText = response.text();

      logger.info('Gemini API request successful', {
        ...requestContext,
        responseLength: generatedText.length,
        success: true
      });

      return generatedText;
    } catch (error: any) {
      const errorDetails = {
        ...requestContext,
        error: {
          message: error.message || 'Unknown error',
          name: error.name || 'UnknownError',
          code: error.code || 'UNKNOWN_CODE',
          status: error.status || error.statusCode || 'UNKNOWN_STATUS',
          stack: error.stack,
          details: error.details || error.response?.data || null
        },
        success: false
      };

      logger.error('Gemini API request failed', errorDetails);
      
      // Re-throw with enhanced context
      const enhancedError = new Error(`Gemini API failed: ${error.message}`) as Error & { cause?: any };
      enhancedError.cause = error;
      throw enhancedError;
    }
  }

  private async generateWithOpenRouter(messages: any[], temperature: number = 0.9, maxTokens: number = 800, model?: string): Promise<string> {
    const modelToUse = model || this.model;
    const requestContext = {
      model: modelToUse,
      provider: 'openrouter',
      temperature,
      maxTokens,
      messageCount: messages.length,
      timestamp: new Date().toISOString()
    };

    logger.info('Starting OpenRouter API request', requestContext);

    try {
      const response = await this.openRouterClient.chat.completions.create({
        model: modelToUse,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const generatedText = response.choices[0]?.message?.content?.trim() || '';

      logger.info('OpenRouter API request successful', {
        ...requestContext,
        responseLength: generatedText.length,
        choicesCount: response.choices?.length || 0,
        finishReason: response.choices[0]?.finish_reason,
        usage: response.usage,
        success: true
      });

      return generatedText;
    } catch (error: any) {
      const errorDetails = {
        ...requestContext,
        error: {
          message: error.message || 'Unknown error',
          name: error.name || 'UnknownError',
          code: error.code || 'UNKNOWN_CODE',
          status: error.status || error.statusCode || 'UNKNOWN_STATUS',
          type: error.type || 'unknown_error_type',
          stack: error.stack,
          details: error.error || error.response?.data || null
        },
        success: false
      };

      logger.error('OpenRouter API request failed', errorDetails);
      
      // Re-throw with enhanced context
      const enhancedError = new Error(`OpenRouter API failed: ${error.message}`) as Error & { cause?: any };
      enhancedError.cause = error;
      throw enhancedError;
    }
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

    console.log('\n🚀 PARALLEL generation of 3 variants with fallback support...');

    // Generate all variants in parallel with fallback support
    const variantPromises = [0, 1, 2].map(async (i) => {
      const variantStart = Date.now();
      console.log(`🔄 Starting variant ${i + 1}/3 generation...`);

      const temperature = 0.9 + i * 0.1; // Different temperature for more variety

      try {
        const text = await this.generateWithFallback(
          'story',
          async (model: string) => {
            if (this.isGeminiModel(model)) {
              // Use direct Gemini API with correct model name
              const geminiModel = model.includes('google/') ? model.replace('google/', '') : model;
              return await this.generateWithGemini(description, systemPrompt, temperature, geminiModel);
            } else {
              // Use OpenRouter
              return await this.generateWithOpenRouter([
                { role: 'system', content: systemPrompt }, 
                { role: 'user', content: description }
              ], temperature, 800, model);
            }
          }
        );

        const variantTime = ((Date.now() - variantStart) / 1000).toFixed(1);
        console.log(`✅ Variant ${i + 1} generated (${text.length} characters) - ${variantTime}s`);

        return {
          text,
          variant: i + 1,
        };
      } catch (error: any) {
        const errorContext = {
          method: 'generateStoryVariants',
          variant: i + 1,
          temperature,
          descriptionLength: description.length,
          duration,
          timestamp: new Date().toISOString(),
          error: {
            message: error.message || 'Unknown error',
            name: error.name || 'UnknownError',
            cause: error.cause || null
          }
        };

        logger.error(`Story variant ${i + 1} generation failed after all fallbacks`, errorContext);
        console.error(`❌ Error generating variant ${i + 1} (all fallbacks exhausted):`, error);
        
        return {
          text: '',
          variant: i + 1,
        };
      }
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

    console.log('\n🔄 Generating prompts with fallback support...');

    try {
      const content = await this.generateWithFallback(
        'prompts',
        async (model: string) => {
          if (this.isGeminiModel(model)) {
            // Use direct Gemini API with correct model name
            const geminiModel = model.includes('google/') ? model.replace('google/', '') : model;
            return await this.generateWithGemini(`Story text:\n\n${storyText}`, systemPrompt, 0.7, geminiModel);
          } else {
            // Use OpenRouter
            return await this.generateWithOpenRouter([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Story text:\n\n${storyText}` },
            ], 0.7, 2000, model);
          }
        }
      );

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
    } catch (error: any) {
      const errorContext = {
        method: 'generateVideoPrompts',
        temperature: 0.7,
        maxTokens: 2000,
        storyTextLength: storyText.length,
        duration,
        segmentCount,
        referenceImagesCount: referenceImages.length,
        timestamp: new Date().toISOString(),
        error: {
          message: error.message || 'Unknown error',
          name: error.name || 'UnknownError',
          cause: error.cause || null
        }
      };

      logger.error('Video prompts generation failed after all fallbacks', errorContext);
      console.error('❌ Error generating video prompts (all fallbacks exhausted):', error);
      
      // Return empty array as fallback
      return [];
    }
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

    try {
      return await this.generateWithFallback(
        'regenerate',
        async (model: string) => {
          if (this.isGeminiModel(model)) {
            // Use direct Gemini API with correct model name
            const geminiModel = model.includes('google/') ? model.replace('google/', '') : model;
            return await this.generateWithGemini(description, systemPrompt, temperature, geminiModel);
          } else {
            // Use OpenRouter
            return await this.generateWithOpenRouter([
              { role: 'system', content: systemPrompt }, 
              { role: 'user', content: description }
            ], temperature, 800, model);
          }
        }
      );
    } catch (error: any) {
      const errorContext = {
        method: 'regenerateSingleVariant',
        temperature,
        descriptionLength: description.length,
        duration,
        timestamp: new Date().toISOString(),
        error: {
          message: error.message || 'Unknown error',
          name: error.name || 'UnknownError',
          cause: error.cause || null
        }
      };

      logger.error('Single variant regeneration failed after all fallbacks', errorContext);
      console.error('❌ Error regenerating variant (all fallbacks exhausted):', error);
      return '';
    }
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

    try {
      return await this.generateWithFallback(
        'modify',
        async (model: string) => {
          if (this.isGeminiModel(model)) {
            // Use direct Gemini API with correct model name
            const geminiModel = model.includes('google/') ? model.replace('google/', '') : model;
            return await this.generateWithGemini(
              `Original story:\n${originalText}\n\nModification request: ${modificationPrompt}`, 
              systemPrompt, 
              0.7,
              geminiModel
            );
          } else {
            // Use OpenRouter
            return await this.generateWithOpenRouter([
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Original story:\n${originalText}\n\nModification request: ${modificationPrompt}` },
            ], 0.7, 800, model);
          }
        }
      );
    } catch (error: any) {
      const errorContext = {
        method: 'modifyVariant',
        temperature: 0.7,
        originalTextLength: originalText.length,
        modificationPromptLength: modificationPrompt.length,
        duration,
        timestamp: new Date().toISOString(),
        error: {
          message: error.message || 'Unknown error',
          name: error.name || 'UnknownError',
          cause: error.cause || null
        }
      };

      logger.error('Variant modification failed after all fallbacks', errorContext);
      console.error('❌ Error modifying variant (all fallbacks exhausted):', error);
      return '';
    }
  }
}
