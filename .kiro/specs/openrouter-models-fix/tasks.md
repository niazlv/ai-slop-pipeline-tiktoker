# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - OpenRouter Models Unavailability
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test that TextGeneratorClient fails when using OpenAI/Gemini models through OpenRouter (isBugCondition: model starts with "openai/" or "google/" AND apiProvider == "openrouter")
  - The test assertions should match the Expected Behavior Properties from design: successful text generation through direct APIs
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause (API errors, unavailable models, insufficient logging)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Working OpenRouter Models Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for working OpenRouter models (x-ai/grok-4.1-fast)
  - Observe behavior for free model generation and existing response formats
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix for OpenRouter models unavailability

  - [x] 3.1 Add Google Gemini API integration
    - Install Google AI SDK as dependency (`npm install @google/generative-ai`)
    - Create direct Gemini API client in TextGeneratorClient
    - Add GOOGLE_GEMINI_API_KEY environment variable support
    - Implement model detection logic for Gemini models (model contains "gemini" or "google/")
    - _Bug_Condition: isBugCondition(input) where input.model starts with "openai/" or "google/" AND input.apiProvider == "openrouter"_
    - _Expected_Behavior: successful text generation through direct Google Gemini API for Gemini models_
    - _Preservation: Working OpenRouter models continue to work unchanged_
    - _Requirements: 2.2_

  - [x] 3.2 Implement enhanced error logging
    - Add detailed API error logging with status codes and error messages
    - Include model name, provider, and request context in logs
    - Add timestamps and structured logging format
    - Log full error details for debugging and diagnostics
    - _Bug_Condition: insufficient error information when API calls fail_
    - _Expected_Behavior: detailed error logging for all API failures_
    - _Preservation: Existing logging functionality remains unchanged_
    - _Requirements: 2.3_

  - [x] 3.3 Create fallback mechanisms
    - Define priority list of models for each request type
    - Implement automatic model switching on API failures
    - Add fallback configuration for different scenarios
    - Create provider abstraction for multiple API providers
    - _Bug_Condition: system fails completely when primary model is unavailable_
    - _Expected_Behavior: automatic fallback to alternative working models_
    - _Preservation: Primary model behavior unchanged when available_
    - _Requirements: 2.1_

  - [x] 3.4 Update environment configuration
    - Add GOOGLE_GEMINI_API_KEY to .env.example
    - Update documentation for new API key setup
    - Add fallback model configuration options
    - Ensure backward compatibility with existing configuration
    - _Requirements: 2.2_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Direct API Access for Gemini Models
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: Expected Behavior Properties from design_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Working OpenRouter Models Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.