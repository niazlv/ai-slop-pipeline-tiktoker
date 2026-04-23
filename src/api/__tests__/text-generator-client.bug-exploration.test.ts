import { describe, it, expect, beforeEach } from 'vitest';
import { TextGeneratorClient } from '../text-generator-client';
import * as fc from 'fast-check';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Bug Condition Exploration Test
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * **GOAL**: Surface counterexamples that demonstrate the bug exists
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */
describe('TextGeneratorClient - Bug Condition Exploration', () => {
  let client: TextGeneratorClient;

  beforeEach(() => {
    // Set up environment to use problematic OpenAI/Gemini models through OpenRouter
    // Use real API keys from environment for proper testing
    process.env.OPENROUTER_MODEL = 'openai/gpt-4'; // This should fail through OpenRouter
    
    // Ensure OpenAI SDK doesn't complain about missing OPENAI_API_KEY
    // We're using OpenRouter, so we set this to the OpenRouter key
    if (!process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = process.env.OPENROUTER_API_KEY;
    }
    
    client = new TextGeneratorClient(false); // Use paid model
  });

  /**
   * Property 1: Bug Condition - OpenRouter Models Unavailability
   * 
   * This test checks that TextGeneratorClient fails when using OpenAI/Gemini models 
   * through OpenRouter due to platform limitations.
   * 
   * Bug Condition: isBugCondition(input) where:
   * - input.model starts with "openai/" or "google/" 
   * - AND input.apiProvider == "openrouter"
   * 
   * Expected Behavior (after fix): successful text generation through direct APIs
   */
  it('should fail when using OpenAI models through OpenRouter (Bug Condition)', async () => {
    // Test with OpenAI model through OpenRouter - this should fail on unfixed code
    const description = 'Create a short story about a robot learning to paint';
    const duration = 30;

    // This test is expected to FAIL on unfixed code
    // The failure will demonstrate the bug exists
    try {
      const result = await client.generateStoryVariants(description, duration);
      
      // If we reach here, the bug condition test should validate expected behavior
      // After the fix is implemented, this should pass with successful generation
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Validate that each variant has the expected structure
      result.forEach((variant, index) => {
        expect(variant).toHaveProperty('text');
        expect(variant).toHaveProperty('variant');
        expect(typeof variant.text).toBe('string');
        expect(variant.text.length).toBeGreaterThan(0);
        expect(variant.variant).toBe(index + 1);
      });

      console.log('✅ Bug condition test passed - OpenAI model worked through direct API');
    } catch (error) {
      // This is the EXPECTED outcome on unfixed code
      console.log('❌ Bug condition confirmed - OpenAI model failed through OpenRouter:', error);
      
      // Document the counterexample for root cause analysis
      console.log('🔍 Counterexample details:');
      console.log('  - Model:', process.env.OPENROUTER_MODEL);
      console.log('  - API Provider: OpenRouter');
      console.log('  - Error type:', (error as any)?.constructor?.name);
      console.log('  - Error message:', (error as any)?.message);
      
      // On unfixed code, this should fail - which proves the bug exists
      // We expect this to throw, so we'll catch and document it
      throw new Error(`Bug condition confirmed: OpenAI model "${process.env.OPENROUTER_MODEL}" failed through OpenRouter. Error: ${(error as any)?.message}`);
    }
  }, 30000); // 30 second timeout for API calls

  /**
   * Property-based test for Gemini models through OpenRouter
   * Scoped to concrete failing cases for reproducibility
   */
  it('should fail when using Gemini models through OpenRouter (Bug Condition)', async () => {
    // Override to use Gemini model
    const originalModel = process.env.OPENROUTER_MODEL;
    process.env.OPENROUTER_MODEL = 'google/gemini-pro';
    
    try {
      const client = new TextGeneratorClient(false);
      const description = 'Write a story about artificial intelligence';
      const duration = 45;

      try {
        const result = await client.generateStoryVariants(description, duration);
        
        // If we reach here after fix, validate expected behavior
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        
        console.log('✅ Bug condition test passed - Gemini model worked through direct API');
      } catch (error) {
        // This is the EXPECTED outcome on unfixed code
        console.log('❌ Bug condition confirmed - Gemini model failed through OpenRouter:', error);
        
        // Document the counterexample
        console.log('🔍 Counterexample details:');
        console.log('  - Model: google/gemini-pro');
        console.log('  - API Provider: OpenRouter');
        console.log('  - Error type:', (error as any)?.constructor?.name);
        console.log('  - Error message:', (error as any)?.message);
        
        throw new Error(`Bug condition confirmed: Gemini model "google/gemini-pro" failed through OpenRouter. Error: ${(error as any)?.message}`);
      }
    } finally {
      // Restore original model
      process.env.OPENROUTER_MODEL = originalModel;
    }
  }, 30000);

  /**
   * Property-based test for insufficient error logging
   * Tests that current implementation lacks detailed error information
   */
  it('should demonstrate insufficient error logging (Bug Condition)', async () => {
    // Use a model that will definitely fail to test error logging
    const originalModel = process.env.OPENROUTER_MODEL;
    process.env.OPENROUTER_MODEL = 'openai/nonexistent-model';
    
    try {
      const client = new TextGeneratorClient(false);
      const description = 'Test error logging';
      
      try {
        await client.generateStoryVariants(description, 30);
        
        // If this passes after fix, it means error handling was improved
        console.log('✅ Error handling improved - detailed logging implemented');
      } catch (error) {
        // Check if error contains sufficient detail for debugging
        const errorMessage = (error as any)?.message || '';
        const hasDetailedInfo = errorMessage.includes('status') || 
                               errorMessage.includes('code') || 
                               errorMessage.includes('model') ||
                               errorMessage.includes('provider');
        
        if (!hasDetailedInfo) {
          console.log('❌ Bug condition confirmed - insufficient error logging');
          console.log('🔍 Error lacks details:', errorMessage);
          throw new Error(`Bug condition confirmed: Insufficient error logging. Error: ${errorMessage}`);
        } else {
          console.log('✅ Detailed error logging found');
        }
      }
    } finally {
      process.env.OPENROUTER_MODEL = originalModel;
    }
  }, 15000);

  /**
   * Property-based test using fast-check for various OpenAI/Gemini model combinations
   * Scoped to deterministic failing cases
   */
  it('should demonstrate bug condition across multiple OpenAI/Gemini models', async () => {
    // Generate test cases for models that should fail through OpenRouter
    const problematicModels = fc.constantFrom(
      'openai/gpt-4',
      'openai/gpt-4-turbo',
      'openai/gpt-3.5-turbo',
      'google/gemini-pro',
      'google/gemini-1.5-pro'
    );

    const testDescriptions = fc.constantFrom(
      'Create a short story',
      'Write about technology',
      'Describe a journey'
    );

    await fc.assert(
      fc.asyncProperty(
        problematicModels,
        testDescriptions,
        async (model, description) => {
          const originalModel = process.env.OPENROUTER_MODEL;
          process.env.OPENROUTER_MODEL = model;
          
          try {
            const client = new TextGeneratorClient(false);
            
            try {
              const result = await client.generateStoryVariants(description, 30);
              
              // After fix, this should work with direct APIs
              expect(result).toBeDefined();
              expect(Array.isArray(result)).toBe(true);
              console.log(`✅ Model ${model} worked through direct API`);
            } catch (error) {
              // On unfixed code, document the failure
              console.log(`❌ Model ${model} failed through OpenRouter:`, (error as any)?.message);
              throw new Error(`Bug condition: ${model} failed through OpenRouter`);
            }
          } finally {
            process.env.OPENROUTER_MODEL = originalModel;
          }
        }
      ),
      { 
        numRuns: 3, // Limited runs for deterministic testing
        timeout: 45000 // 45 second timeout for property tests
      }
    );
  });
});