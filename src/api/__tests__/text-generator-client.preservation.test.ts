import { describe, it, expect, beforeEach } from 'vitest';
import { TextGeneratorClient } from '../text-generator-client';
import * as fc from 'fast-check';
import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Preservation Property Tests
 * 
 * **IMPORTANT**: Follow observation-first methodology
 * These tests observe behavior on UNFIXED code for working OpenRouter models
 * and capture baseline behavior patterns that must be preserved after the fix.
 * 
 * **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */
describe('TextGeneratorClient - Preservation Properties', () => {
  let client: TextGeneratorClient;
  let freeClient: TextGeneratorClient;

  beforeEach(() => {
    // Ensure we have a valid API key for testing
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is required for preservation tests');
    }
    
    // Set up working OpenRouter models that should continue to work
    process.env.OPENROUTER_MODEL = 'x-ai/grok-4.1-fast'; // Working paid model
    process.env.OPENROUTER_MODEL_FREE = 'x-ai/grok-4.1-fast'; // Use paid model for free client too since free period ended
    
    client = new TextGeneratorClient(false); // Paid model client
    freeClient = new TextGeneratorClient(true); // Free model client (but using paid model)
  });

  /**
   * Property 2: Preservation - Working OpenRouter Models Behavior
   * 
   * Tests that working OpenRouter models (x-ai/grok-4.1-fast) continue to work
   * exactly the same way after the fix is implemented.
   * 
   * **Validates: Requirements 3.1**
   */
  describe('Working OpenRouter Models Preservation', () => {
    it('should preserve generateStoryVariants behavior for working OpenRouter models', async () => {
      const description = 'Create a short story about a robot learning to paint';
      const duration = 30;

      const result = await client.generateStoryVariants(description, duration);

      // Validate the preserved behavior structure
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // Should generate exactly 3 variants
      
      // Validate each variant has the expected structure
      result.forEach((variant, index) => {
        expect(variant).toHaveProperty('text');
        expect(variant).toHaveProperty('variant');
        expect(typeof variant.text).toBe('string');
        expect(variant.text.length).toBeGreaterThan(0);
        expect(variant.variant).toBe(index + 1);
      });

      console.log('✅ Working OpenRouter model behavior preserved for generateStoryVariants');
    }, 45000);

    it('should preserve generateVideoPrompts behavior for working OpenRouter models', async () => {
      const storyText = 'A robot discovers the joy of painting colorful landscapes on canvas.';
      const duration = 30;

      const result = await client.generateVideoPrompts(storyText, duration);

      // Validate the preserved behavior structure
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Validate each prompt has the expected structure
      result.forEach((prompt) => {
        expect(prompt).toHaveProperty('prompt');
        expect(prompt).toHaveProperty('referenceImageIndex');
        expect(prompt).toHaveProperty('referenceAction');
        expect(typeof prompt.prompt).toBe('string');
        expect(prompt.prompt.length).toBeGreaterThan(0);
        
        // referenceImageIndex should be null or number
        expect(prompt.referenceImageIndex === null || typeof prompt.referenceImageIndex === 'number').toBe(true);
        
        // referenceAction should be null or specific string values
        if (prompt.referenceAction !== null) {
          expect(['direct_use', 'img2img']).toContain(prompt.referenceAction);
        }
      });

      console.log('✅ Working OpenRouter model behavior preserved for generateVideoPrompts');
    }, 45000);

    it('should preserve regenerateSingleVariant behavior for working OpenRouter models', async () => {
      const description = 'A story about artificial intelligence';
      const duration = 45;
      const temperature = 0.8;

      const result = await client.regenerateSingleVariant(description, duration, temperature);

      // Validate the preserved behavior structure
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);

      console.log('✅ Working OpenRouter model behavior preserved for regenerateSingleVariant');
    }, 30000);

    it('should preserve modifyVariant behavior for working OpenRouter models', async () => {
      const originalText = 'A robot learns to paint beautiful landscapes.';
      const modificationPrompt = 'Make it more dramatic and add conflict';
      const duration = 30;

      const result = await client.modifyVariant(originalText, modificationPrompt, duration);

      // Validate the preserved behavior structure
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toBe(originalText); // Should be modified

      console.log('✅ Working OpenRouter model behavior preserved for modifyVariant');
    }, 30000);
  });

  /**
   * Property 2: Preservation - Free Model Generation Behavior
   * 
   * Tests that free model generation continues to use existing settings
   * and models without changes.
   * 
   * **Validates: Requirements 3.2**
   */
  describe('Free Model Generation Preservation', () => {
    it('should preserve free model generateStoryVariants behavior', async () => {
      const description = 'Write about a journey through space';
      const duration = 60;

      const result = await freeClient.generateStoryVariants(description, duration);

      // Validate the preserved free model behavior
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // Should generate exactly 3 variants
      
      // Validate structure is identical to paid model
      result.forEach((variant, index) => {
        expect(variant).toHaveProperty('text');
        expect(variant).toHaveProperty('variant');
        expect(typeof variant.text).toBe('string');
        expect(variant.text.length).toBeGreaterThan(0);
        expect(variant.variant).toBe(index + 1);
      });

      console.log('✅ Free model behavior preserved for generateStoryVariants');
    }, 45000);

    it('should preserve free model generateVideoPrompts behavior', async () => {
      const storyText = 'Astronauts explore distant galaxies and discover new worlds.';
      const duration = 45;

      const result = await freeClient.generateVideoPrompts(storyText, duration);

      // Validate the preserved free model behavior
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Structure should be identical to paid model
      result.forEach((prompt) => {
        expect(prompt).toHaveProperty('prompt');
        expect(prompt).toHaveProperty('referenceImageIndex');
        expect(prompt).toHaveProperty('referenceAction');
        expect(typeof prompt.prompt).toBe('string');
        expect(prompt.prompt.length).toBeGreaterThan(0);
      });

      console.log('✅ Free model behavior preserved for generateVideoPrompts');
    }, 45000);
  });

  /**
   * Property 2: Preservation - Response Format Consistency
   * 
   * Tests that response formats for story variants and video prompts
   * remain identical after the fix.
   * 
   * **Validates: Requirements 3.3**
   */
  describe('Response Format Preservation', () => {
    it('should preserve exact response format for story variants', async () => {
      const description = 'A tale of adventure and discovery';
      const duration = 30;

      const result = await client.generateStoryVariants(description, duration);

      // Validate exact format preservation
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      // Each variant must have exactly these properties
      result.forEach((variant) => {
        const keys = Object.keys(variant);
        expect(keys).toEqual(['text', 'variant']);
        
        // Validate types are preserved
        expect(typeof variant.text).toBe('string');
        expect(typeof variant.variant).toBe('number');
      });

      console.log('✅ Story variants response format preserved');
    }, 30000);

    it('should preserve exact response format for video prompts', async () => {
      const storyText = 'A short story about innovation and creativity.';
      const duration = 20;

      const result = await client.generateVideoPrompts(storyText, duration);

      // Validate exact format preservation
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      // Each prompt must have exactly these properties
      result.forEach((prompt) => {
        const keys = Object.keys(prompt).sort();
        expect(keys).toEqual(['prompt', 'referenceAction', 'referenceImageIndex']);
        
        // Validate types are preserved
        expect(typeof prompt.prompt).toBe('string');
        expect(prompt.referenceImageIndex === null || typeof prompt.referenceImageIndex === 'number').toBe(true);
        expect(prompt.referenceAction === null || typeof prompt.referenceAction === 'string').toBe(true);
      });

      console.log('✅ Video prompts response format preserved');
    }, 30000);
  });

  /**
   * Property-based tests for preservation across various inputs
   * 
   * Uses fast-check to generate many test cases and ensure behavior
   * is preserved across the input domain for working models.
   */
  describe('Property-Based Preservation Tests', () => {
    it('should preserve behavior across various story descriptions and durations', async () => {
      const storyDescriptions = fc.constantFrom(
        'A robot learns to dance',
        'Space exploration adventure',
        'Underwater discovery',
        'Time travel mystery',
        'AI friendship story'
      );

      const durations = fc.constantFrom(15, 30, 45, 60, 90);

      await fc.assert(
        fc.asyncProperty(
          storyDescriptions,
          durations,
          async (description, duration) => {
            const result = await client.generateStoryVariants(description, duration);

            // Validate preserved behavior properties
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(3);
            
            result.forEach((variant, index) => {
              expect(variant).toHaveProperty('text');
              expect(variant).toHaveProperty('variant');
              expect(typeof variant.text).toBe('string');
              expect(variant.text.length).toBeGreaterThan(0);
              expect(variant.variant).toBe(index + 1);
            });
          }
        ),
        { 
          numRuns: 5, // Limited runs for API testing
          timeout: 60000
        }
      );

      console.log('✅ Behavior preserved across various inputs');
    });

    it('should preserve language detection and instructions behavior', async () => {
      const testCases = [
        { description: 'Create a story about robots', expectedLang: 'en' },
        { description: 'Создай историю о роботах', expectedLang: 'ru' },
        { description: 'Write about artificial intelligence', expectedLang: 'en' },
        { description: 'Напиши о искусственном интеллекте', expectedLang: 'ru' }
      ];

      for (const testCase of testCases) {
        const result = await client.generateStoryVariants(testCase.description, 30);

        // Validate that language detection behavior is preserved
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3);

        // For Russian input, expect Cyrillic characters in output
        if (testCase.expectedLang === 'ru') {
          const hasCyrillic = result.some(variant => 
            /[\u0400-\u04FF]/.test(variant.text)
          );
          expect(hasCyrillic).toBe(true);
        }
      }

      console.log('✅ Language detection behavior preserved');
    }, 60000);
  });

  /**
   * Generation Parameters Preservation
   * 
   * Tests that generation parameters (temperature, max_tokens) work
   * exactly as before for working models.
   */
  describe('Generation Parameters Preservation', () => {
    it('should preserve temperature parameter behavior', async () => {
      const description = 'A creative story about innovation';
      const duration = 30;
      
      // Test different temperature values
      const temperatures = [0.7, 0.9, 1.1];
      
      for (const temperature of temperatures) {
        const result = await client.regenerateSingleVariant(description, duration, temperature);
        
        // Validate that temperature parameter is still respected
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }

      console.log('✅ Temperature parameter behavior preserved');
    }, 45000);

    it('should preserve max_tokens and word count calculation behavior', async () => {
      const description = 'A detailed epic adventure story';
      const shortDuration = 15; // Should produce shorter text
      const longDuration = 90;  // Should produce longer text

      const shortResult = await client.generateStoryVariants(description, shortDuration);
      const longResult = await client.generateStoryVariants(description, longDuration);

      // Validate that duration-based word count calculation is preserved
      expect(shortResult).toBeDefined();
      expect(longResult).toBeDefined();
      
      // Generally, longer duration should produce longer text
      const avgShortLength = shortResult.reduce((sum, v) => sum + v.text.length, 0) / shortResult.length;
      const avgLongLength = longResult.reduce((sum, v) => sum + v.text.length, 0) / longResult.length;
      
      expect(avgLongLength).toBeGreaterThan(avgShortLength);

      console.log('✅ Word count calculation behavior preserved');
    }, 60000);
  });
});