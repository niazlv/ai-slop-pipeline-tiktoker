import { VideoGenerationWorkflow } from '../workflows/video-generation-workflow.js';
import { TextGeneratorClient } from '../api/text-generator-client.js';
import { GenerationParams } from './types.js';

export type PipelineStage =
  | 'story_generation'
  | 'prompt_generation'
  | 'image_generation'
  | 'video_generation'
  | 'audio_generation'
  | 'merging';

export type ProgressCallback = (
  stage: PipelineStage,
  current?: number,
  total?: number
) => void;

export class WorkflowAdapter {
  async run(
    params: GenerationParams,
    onProgress: ProgressCallback,
    signal: AbortSignal
  ): Promise<string> {
    // Stage 1: Story generation
    if (signal.aborted) throw new Error('Generation cancelled');
    onProgress('story_generation');

    const textGenerator = new TextGeneratorClient(params.useFreeModels);
    const variants = await textGenerator.generateStoryVariants(
      params.description,
      params.duration
    );
    const storyText = variants[0]?.text || params.description;

    // Stage 2: Prompt generation
    if (signal.aborted) throw new Error('Generation cancelled');
    onProgress('prompt_generation');

    const workflow = new VideoGenerationWorkflow(params.useFreeModels);
    const promptMappings = await workflow.generateVideoPrompts(
      storyText,
      params.duration
    );
    const prompts = promptMappings.map((m) => m.prompt);

    // Stage 3: Image generation
    if (signal.aborted) throw new Error('Generation cancelled');
    onProgress('image_generation');

    // Stage 4: Video generation
    if (signal.aborted) throw new Error('Generation cancelled');
    onProgress('video_generation');

    const videoPaths = await workflow.generateVideos(
      prompts,
      params.duration,
      params.aspectRatio,
      [],
      '',
      (current, total) => onProgress('video_generation', current, total)
    );

    // Stage 5: Audio generation
    if (signal.aborted) throw new Error('Generation cancelled');
    onProgress('audio_generation');

    const audioPath = await workflow.generateAudio(storyText, params.voiceId);

    // Stage 6: Merging
    if (signal.aborted) throw new Error('Generation cancelled');
    onProgress('merging');

    const mergedResult = await workflow.mergeVideos(videoPaths);
    const finalPath = await workflow.addAudioToVideo(
      mergedResult.outputPath,
      audioPath
    );

    return finalPath;
  }
}
