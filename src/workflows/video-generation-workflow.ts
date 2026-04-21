import { TextGeneratorClient, PromptMapping } from '../api/text-generator-client';
import { Veo3Client } from '../api/fal-veo3-client';
import { ElevenLabsTTSClient } from '../api/elevenlabs-client';
import { SpeechToTextClient } from '../api/fal-speech-client';
import { FluxClient } from '../api/flux-client';
import { VideoMerger } from '../utils/video-merger';
import { VideoDownloader } from '../utils/video-downloader';
import { SessionManager } from '../utils/session-manager';
import { ImageUploader } from '../utils/image-uploader';
import { RetryHelper } from '../utils/retry-helper';
import { VideoStep, ReferenceImage } from '../types/video-step';
import { CostCalculator } from '../utils/cost-calculator';
import { generateSubtitleFile, SubtitleWord } from '../utils/subtitle-generator';

interface VideoGenerationResult {
  index: number;
  path: string | null;
  success: boolean;
  error?: string;
  prompt?: string;
}

export class VideoGenerationWorkflow {
  private textGenerator: TextGeneratorClient;
  private veo3Client: Veo3Client;
  private ttsClient: ElevenLabsTTSClient;
  private fluxClient: FluxClient;
  private videoMerger: VideoMerger;
  private videoDownloader: VideoDownloader;
  private session: SessionManager;
  private referenceImageUrls: Map<number, string> = new Map();
  private costCalculator: CostCalculator;

  constructor(useFreeModels: boolean = false, existingSessionPath?: string) {
    this.textGenerator = new TextGeneratorClient(useFreeModels);
    this.veo3Client = new Veo3Client(undefined, useFreeModels);
    this.ttsClient = new ElevenLabsTTSClient();
    this.fluxClient = new FluxClient(undefined, useFreeModels);
    this.videoMerger = new VideoMerger();
    this.videoDownloader = new VideoDownloader();
    this.session = new SessionManager('./output', existingSessionPath);

    // Initialize cost calculator with current models
    this.costCalculator = new CostCalculator(
      this.veo3Client.getModelId(),
      this.fluxClient.getModelId(),
      'elevenlabs'
    );

    this.session.printSummary();
  }

  async generateVideoPrompts(storyText: string, duration: number = 60, referenceImages: ReferenceImage[] = []): Promise<PromptMapping[]> {
    // Wrap in retry for error resilience
    return await RetryHelper.retry(
      async () => {
        return await this.textGenerator.generateVideoPrompts(storyText, duration, referenceImages);
      },
      {
        maxAttempts: 3,
        delayMs: 2000,
        backoffMultiplier: 2,
        onRetry: (attempt, error) => {
          console.log(`⚠️  Prompt generation: attempt ${attempt}/3 failed`);
          console.log(`   Error: ${error.message}`);
          console.log(`   🔄 Retrying in ${2000 * Math.pow(2, attempt - 1)}ms...`);
        },
      }
    );
  }

  async generateVideos(
    prompts: string[],
    duration: number = 60,
    aspectRatio: '16:9' | '9:16' = '9:16',
    referenceImages: ReferenceImage[] = [],
    stylePrompt: string = '',
    onProgress?: (current: number, total: number) => void,
    videoSteps?: VideoStep[]
  ): Promise<string[]> {
    const startTime = Date.now();

    // Use short segments for more dynamic video
    // Veo3: 4s (shortest), Seedance: 5s (shortest)
    const segmentDuration = 4;
    const videoDuration = '4s';  // Will be automatically adapted for Seedance in client

    console.log(`\n⏱️  Video duration: ${videoDuration}`);
    console.log(`🚀 PARALLEL generation of ${prompts.length} videos`);
    if (stylePrompt) {
      console.log(`🎨 Image style: ${stylePrompt}`);
    }

    // If reference images specified, upload them all
    for (const ref of referenceImages) {
      try {
        const url = await ImageUploader.uploadImage(ref.path);
        this.referenceImageUrls.set(ref.id, url);
        console.log(`✅ Reference #${ref.id} (${ref.description}) uploaded`);
      } catch (error) {
        console.error(`❌ Reference image #${ref.id} upload error:`, error);
      }
    }

    // Counter for completed videos (progress tracking)
    let completed = 0;

    // Create promises for parallel generation of all videos
    const videoPromises: Promise<VideoGenerationResult>[] = prompts.map(async (prompt, i) => {
      const videoStartTime = Date.now();
      console.log(`\n🎬 Starting video ${i + 1}/${prompts.length} generation...`);
      console.log(`📝 Prompt: ${prompt.substring(0, 80)}...`);

      // Get custom duration if videoSteps provided
      const customDuration = videoSteps?.[i]?.duration;
      // Map custom duration to supported values: 4s, 5s, 6s, 8s
      let stepVideoDuration: '4s' | '5s' | '6s' | '8s' | undefined = videoDuration as '4s' | '5s' | '6s' | '8s';
      if (customDuration) {
        if (customDuration <= 4) stepVideoDuration = '4s';
        else if (customDuration <= 5) stepVideoDuration = '5s';
        else if (customDuration <= 6) stepVideoDuration = '6s';
        else stepVideoDuration = '8s';
      }

      // Wrap in retry for error resilience
      try {
        return await RetryHelper.retry(
          async () => {
              const step = videoSteps?.[i];
              // Handle direct_use: skip Flux AND skip Veo3! Return static banner video instead
              if (step?.referenceAction === 'direct_use' && step?.referenceImageIndex != null) {
                const refObj = referenceImages[step.referenceImageIndex];
                if (refObj) {
                  console.log(`🖼️  Video ${i + 1}: Using static banner from reference #${step.referenceImageIndex}`);
                  // Create a static video from the image directly using ffmpeg
                  const durationSec = stepVideoDuration === '4s' ? 4 : parseInt(stepVideoDuration || '5');
                  const bannerPath = await this.createBannerVideo(refObj.path, durationSec);
                  
                  // Copy to expected video path
                  const videoPath = this.session.getVideoPath(i + 1);
                  await import('fs/promises').then(fs => fs.copyFile(bannerPath, videoPath));
                  
                  return {
                    index: i,
                    path: videoPath,
                    success: true,
                  } as VideoGenerationResult; // Skip Veo3 generation!
                }
              }

              let imageUrl: string;

              // Use prepared image if available, otherwise generate new one
              if (step?.imageUrl) {
                imageUrl = step.imageUrl;
                console.log(`✅ Using prepared image for video ${i + 1}`);
                // Track image generation cost (image was generated earlier in StepsReview)
                this.costCalculator.addImage(1);
              } else {
                // Normal image generation (img2img or no reference)
                const imagePath = this.session.getImagePath(i + 1);
                let refUrl: string | undefined;
                if (step?.referenceAction === 'img2img' && step?.referenceImageIndex != null) {
                  refUrl = this.referenceImageUrls.get(step.referenceImageIndex) || undefined;
                }
                imageUrl = await this.fluxClient.generateImage(
                  prompt,
                  imagePath,
                  aspectRatio,
                  refUrl,
                  stylePrompt || undefined
                );
                // Track image generation cost
                this.costCalculator.addImage(1);
              }

              // Then generate video from image
              const result = await this.veo3Client.generateVideo(
                prompt,
                imageUrl,
                stepVideoDuration,
                aspectRatio
              );

            // Track video generation cost
            this.costCalculator.addVideo(1);

            console.log(`✅ Video ${i + 1} generated: ${result.videoUrl}`);

            // Download video immediately after generation
            const videoPath = this.session.getVideoPath(i + 1);
            await this.videoDownloader.downloadVideo(result.videoUrl, videoPath);
            console.log(`💾 Video ${i + 1} saved: ${videoPath}`);

            // Update progress
            completed++;
            if (onProgress) {
              onProgress(completed, prompts.length);
            }

            const videoTime = ((Date.now() - videoStartTime) / 1000).toFixed(1);
            console.log(`✅ Completed ${completed}/${prompts.length} videos - ${videoTime}s`);

            return {
              index: i,
              path: videoPath,
              success: true,
            } as VideoGenerationResult;
          },
          {
            maxAttempts: 3,
            delayMs: 3000,
            backoffMultiplier: 2,
            onRetry: (attempt, error) => {
              console.log(`⚠️  Video ${i + 1}: attempt ${attempt}/3 failed`);
              console.log(`   Error: ${error.message}`);
              console.log(`   🔄 Retrying in ${3000 * Math.pow(2, attempt - 1)}ms...`);
            },
          }
        );
      } catch (error) {
        // Log error and return failed result
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Video ${i + 1} FAILED to generate after all attempts`);
        console.error(`   Error: ${errorMessage}`);
        console.error(`   Prompt: ${prompt}`);
        console.log(`⚠️  Continuing with remaining videos...\n`);

        return {
          index: i,
          path: null,
          success: false,
          error: errorMessage,
          prompt,
        } as VideoGenerationResult;
      }
    });

    // Wait for all videos to complete in parallel (even if some fail)
    console.log('\n⏳ Waiting for all videos to complete...');
    const results = await Promise.all(videoPromises);

    // Sort by index to preserve order
    results.sort((a, b) => a.index - b.index);

    // Separate successful and failed results
    const successfulResults = results.filter(r => r.success && r.path);
    const failedResults = results.filter(r => !r.success);

    const videoPaths = successfulResults.map(r => r.path!);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Results report
    console.log('\n' + '='.repeat(60));
    console.log('📊 VIDEO GENERATION RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Successful: ${successfulResults.length}/${prompts.length} videos`);
    if (failedResults.length > 0) {
      console.log(`❌ Errors: ${failedResults.length}/${prompts.length} videos\n`);
      console.log('Problematic prompts:');
      failedResults.forEach(f => {
        console.log(`  ${f.index + 1}. ${f.prompt?.substring(0, 60)}...`);
        console.log(`     Error: ${f.error}\n`);
      });
    }
    console.log(`⏱️  Total time: ${totalTime}s`);
    console.log('='.repeat(60) + '\n');

    // If NO videos were generated - throw error
    if (videoPaths.length === 0) {
      throw new Error('Failed to generate any videos. Check prompts and API settings.');
    }

    // If at least one video exists - continue
    if (failedResults.length > 0) {
      console.log(`⚠️  Continuing with ${videoPaths.length} successful videos\n`);
    }

    return videoPaths;
  }

  async generateAudio(text: string, voiceId?: string): Promise<string> {
    const startTime = Date.now();

    // Set voice if provided
    if (voiceId) {
      this.ttsClient.setVoiceId(voiceId);
    }

    // Wrap in retry for error resilience
    const result = await RetryHelper.retry(
      async () => {
        const result = await this.ttsClient.generateSpeech(text, this.session.getPaths().audio);
        return result;
      },
      {
        maxAttempts: 3,
        delayMs: 3000,
        backoffMultiplier: 2,
        onRetry: (attempt, error) => {
          console.log(`⚠️  Audio generation: attempt ${attempt}/3 failed`);
          console.log(`   Error: ${error.message}`);
          console.log(`   🔄 Retrying in ${3000 * Math.pow(2, attempt - 1)}ms...`);
        },
      }
    );

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️  Audio generation time: ${totalTime}s`);

    // Track audio generation cost
    this.costCalculator.addAudio(text.length);

    // Return actual audio file path
    return result.audioPath;
  }


  async mergeVideos(videoPaths: string[]): Promise<{ outputPath: string, duration: number }> {
    const startTime = Date.now();
    const result = await this.videoMerger.mergeVideos(videoPaths, this.session.getPaths().result);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️  Video merging time: ${totalTime}s`);
    // Return actual created file path and duration
    return result;
  }

  async createBannerVideo(imagePath: string, durationSec: number = 4): Promise<string> {
    const startTime = Date.now();
    console.log('\n🖼️ Creating banner video...');
    const result = await this.videoMerger.createBannerVideo(imagePath, durationSec, this.session.getPaths().videos);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️  Banner creation time: ${totalTime}s`);
    return result;
  }

  async mergeWithCrossfade(videoPath1: string, videoPath2: string, duration1: number, crossfadeDuration: number = 1): Promise<{ outputPath: string, duration: number }> {
    const startTime = Date.now();
    console.log('\n🎬 Merging with crossfade...');
    const result = await this.videoMerger.mergeWithCrossfade(videoPath1, videoPath2, duration1, crossfadeDuration, this.session.getPaths().result);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️  Crossfade merge time: ${totalTime}s`);
    return result;
  }

  async addAudioToVideo(videoPath: string, audioPath: string): Promise<string> {
    const startTime = Date.now();
    const finalPath = await this.videoMerger.addAudioToVideo(videoPath, audioPath, this.session.getPaths().result);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️  Audio addition time: ${totalTime}s`);
    // Return actual created file path
    return finalPath;
  }

  async transcribeAudio(audioPath: string): Promise<{ words: SubtitleWord[]; fullText: string }> {
    const startTime = Date.now();
    console.log('\n🎙️ Transcribing audio for subtitles...');

    // Upload audio to FAL storage for STT (can't use ImageUploader — it only accepts image extensions)
    const audioBuffer = (await import('fs')).readFileSync(audioPath);
    const ext = (await import('path')).extname(audioPath).slice(1) || 'mp3';
    const blob = new Blob([audioBuffer], { type: `audio/${ext}` });
    const file = new File([blob], (await import('path')).basename(audioPath), { type: blob.type });
    const { fal } = await import('@fal-ai/client');
    fal.config({ credentials: process.env.FAL_API_KEY! });
    const audioUrl = await fal.storage.upload(file);
    console.log('✅ Audio uploaded for transcription:', audioUrl);

    const sttClient = new SpeechToTextClient();
    const result = await sttClient.transcribe(audioUrl);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️  Transcription time: ${totalTime}s`);
    console.log(`📝 Words transcribed: ${result.words.length}`);

    return {
      words: result.words,
      fullText: result.fullText,
    };
  }

  generateSubtitles(words: SubtitleWord[], aspectRatio: '16:9' | '9:16' = '9:16'): string {
    const subtitlePath = this.session.getSubtitlePath();
    return generateSubtitleFile(words, subtitlePath, aspectRatio);
  }

  async burnSubtitles(videoPath: string, subtitlePath: string): Promise<string> {
    const startTime = Date.now();
    const result = await this.videoMerger.burnSubtitles(videoPath, subtitlePath, this.session.getPaths().result);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️  Subtitle burning time: ${totalTime}s`);
    return result;
  }

  async runComplete(storyText: string, description: string): Promise<string> {
    const workflowStartTime = Date.now();

    console.log('\n' + '='.repeat(60));
    console.log('🚀 FULL WORKFLOW START');
    console.log('='.repeat(60));

    // 1. Generate video prompts
    console.log('\n📝 Step 1: Generating video prompts...');
    const promptMappings = await this.generateVideoPrompts(storyText);
    const prompts = promptMappings.map(m => m.prompt);
    console.log(`✅ Created ${prompts.length} prompts\n`);

    // 2. Generate videos (with images) - videos downloaded automatically
    console.log('\n🎬 Step 2: Generating images and videos...');
    const videoPaths = await this.generateVideos(prompts);
    console.log(`✅ Generated and saved ${videoPaths.length} videos\n`);

    // 3. Generate audio
    console.log('\n🔊 Step 3: Generating narration...');
    const audioPath = await this.generateAudio(storyText);
    console.log(`✅ Narration created: ${audioPath}\n`);

    // 4. Merge videos
    console.log('\n🎞️ Step 4: Merging videos...');
    const mergedVideoResult = await this.mergeVideos(videoPaths);
    console.log(`✅ Videos merged: ${mergedVideoResult.outputPath}\n`);

    // 5. Add audio
    console.log('\n🎵 Step 5: Adding narration...');
    const finalVideoPath = await this.addAudioToVideo(mergedVideoResult.outputPath, audioPath);
    console.log(`✅ Final video: ${finalVideoPath}\n`);

    // 6. Save metadata
    this.session.saveMetadata({
      description,
      storyText,
      prompts,
      videoCount: videoPaths.length,
      finalVideo: finalVideoPath,
    });

    const totalWorkflowTime = ((Date.now() - workflowStartTime) / 1000).toFixed(1);

    console.log('='.repeat(60));
    console.log('🎉 WORKFLOW COMPLETE!');
    console.log('📁 Session folder:', this.session.getPaths().root);
    console.log('📁 Final video:', finalVideoPath);
    console.log(`⏱️  Total execution time: ${totalWorkflowTime}s (${(parseFloat(totalWorkflowTime) / 60).toFixed(1)} min)`);
    console.log('='.repeat(60) + '\n');

    // Print cost breakdown
    this.costCalculator.printCostBreakdown();

    return finalVideoPath;
  }

  getSession(): SessionManager {
    return this.session;
  }

  getCostCalculator(): CostCalculator {
    return this.costCalculator;
  }
}
