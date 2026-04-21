import { fal } from '@fal-ai/client';

export interface FalJobResult {
  request_id?: string;
  status: string;
  response_url?: string;
  queue_position?: number;
  progress?: number;
  error?: string;
}

export class FalBaseClient {
  protected modelId: string;
  protected apiKey: string;

  constructor(modelId: string, customApiKey?: string) {
    this.modelId = modelId;
    this.apiKey = customApiKey || process.env.FAL_API_KEY || '';
    this.initializeClient();
  }

  private initializeClient() {
    console.log('🔧 Initializing FAL client:')
    console.log('   API Key source:', this.apiKey === process.env.FAL_API_KEY ? '.env' : 'custom (from DB)')
    console.log('   API Key present:', !!this.apiKey)
    console.log('   API Key length:', this.apiKey?.length || 0)
    console.log('   Environment:', process.env.NODE_ENV)

    if (!this.apiKey) {
      console.error('❌ FAL_API_KEY not configured!')
      throw new Error('FAL_API_KEY not configured');
    }

    fal.config({
      credentials: this.apiKey,
    });
    console.log('✅ FAL client initialized successfully')
  }

  async submitJob(input: Record<string, unknown>): Promise<{ jobId: string; status: string }> {
    try {
      console.log(`🚀 Submitting job to ${this.modelId}`)
      console.log('   Input keys:', Object.keys(input))
      console.log('   API Key configured:', !!this.apiKey)
      console.log('   API Key prefix:', this.apiKey?.substring(0, 10) + '...')

      const result = await fal.queue.submit(this.modelId, {
        input,
      });

      const jobId = result.request_id;
      console.log(`✅ Job submitted successfully: ${jobId}`)

      return {
        jobId,
        status: result.status || 'IN_QUEUE',
      };
    } catch (error) {
      console.error('❌ FAL API Error Details:')
      console.error('   Model:', this.modelId)
      console.error('   Error type:', error?.constructor?.name)
      console.error('   Error message:', error instanceof Error ? error.message : String(error))

      if (error && typeof error === 'object' && 'response' in error) {
        const response = (error as Record<string, unknown>).response as Record<string, unknown>
        console.error('   HTTP Status:', response?.status)
        console.error('   Response data:', response?.data || response?.body)
      }

      if (error && typeof error === 'object' && 'status' in error) {
        console.error('   Status code:', (error as Record<string, unknown>).status)
      }

      // Check for specific error types and provide helpful messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('Exhausted balance') || errorMessage.includes('User is locked')) {
        throw new Error('Недостаточно средств на аккаунте FAL.AI. Необходимо пополнить баланс на fal.ai/dashboard/billing для продолжения генерации видео.');
      }
      
      if (errorMessage.includes('Forbidden') || errorMessage.includes('403')) {
        throw new Error('API access forbidden. Please check: 1) API key validity, 2) Model access permissions, 3) Account credits/limits. Try using free models or contact FAL support.');
      }
      
      if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
        throw new Error('API key is invalid or expired. Please check your FAL_API_KEY in .env file.');
      }
      
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        throw new Error('Rate limit exceeded. Please wait a few minutes before trying again or upgrade your FAL account.');
      }

      throw error;
    }
  }

  async checkStatus(jobId: string): Promise<FalJobResult> {
    try {
      const statusResult = await fal.queue.status(this.modelId, {
        requestId: jobId,
      });

      return statusResult as FalJobResult;
    } catch (error) {
      console.error('❌ FAL Status Check Error:')
      console.error('   Job ID:', jobId)
      console.error('   Model:', this.modelId)
      console.error('   Error:', error instanceof Error ? error.message : String(error))
      throw error;
    }
  }

  async getResult(responseUrl: string): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(responseUrl, {
        headers: {
          'Authorization': `Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Check for content policy violation
        if (response.status === 422) {
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.detail?.[0]?.type === 'content_policy_violation') {
              const errorMessage = 'The image violates content policy and cannot be processed. Please use a different image that complies with content guidelines.';
              console.log('⚠️  CONTENT POLICY VIOLATION DETECTED');
              throw new Error(`CONTENT_POLICY_VIOLATION: ${errorMessage}`);
            }
          } catch (parseError) {
            // If not JSON or different structure, continue with normal error
          }
        }

        throw new Error(`Failed to fetch result: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as Record<string, unknown>;

      return result;
    } catch (error) {
      throw error;
    }
  }

  async uploadFile(file: File): Promise<string> {
    try {
      const url = await fal.storage.upload(file);
      return url;
    } catch (error) {
      throw error;
    }
  }

  async waitForCompletion(jobId: string, maxAttempts = 300, delayMs = 2000, onProgress?: (status: string, queuePosition?: number, progress?: number) => void): Promise<Record<string, unknown>> {
    console.log(`⏳ Starting polling for job ${jobId}`)

    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.checkStatus(jobId);

      console.log(`🔄 Poll ${i + 1}/${maxAttempts} - Status: ${status.status}${status.queue_position ? `, Queue position: ${status.queue_position}` : ''}${status.progress ? `, Progress: ${status.progress}%` : ''}`)

      // Call progress callback if provided (for bot status updates)
      if (onProgress && (i % 5 === 0 || status.status !== 'IN_QUEUE')) { // Update every 5th poll or when status changes
        onProgress(status.status, status.queue_position, status.progress);
      }

      if (status.status === 'COMPLETED' && status.response_url) {
        console.log('✅ Job completed! Fetching result...')
        const result = await this.getResult(status.response_url);
        console.log('📦 Result retrieved successfully')
        return result;
      }

      if (status.status === 'FAILED') {
        console.log(`❌ Job failed: ${status.error || 'Unknown error'}`)
        throw new Error(status.error || 'Job failed');
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    console.log(`⏱️ Job timeout after ${maxAttempts * delayMs / 1000} seconds`)
    throw new Error('Job timeout');
  }

  getModelId(): string {
    return this.modelId;
  }
}
