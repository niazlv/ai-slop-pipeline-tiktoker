import { VideoGenerationWorkflow } from '../workflows/video-generation-workflow.js';
import { TextGeneratorClient } from '../api/text-generator-client.js';
import { GenerationParams } from './types.js';

export type PipelineStage =
  | 'story_generation'
  | 'prompt_generation'
  | 'image_generation'
  | 'video_generation'
  | 'audio_generation'
  | 'transcription'
  | 'subtitle_generation'
  | 'merging';

export type ProgressCallback = (
  stage: PipelineStage,
  current?: number,
  total?: number,
  details?: string
) => void;

export interface DetailedGenerationResult {
  storyText: string;
  prompts: string[];
}

export class WorkflowAdapter {
  async generateStoryAndPrompts(
    params: GenerationParams
  ): Promise<DetailedGenerationResult> {
    const textGenerator = new TextGeneratorClient(params.useFreeModels);
    const variants = await textGenerator.generateStoryVariants(
      params.description,
      params.duration
    );
    const storyText = variants[0]?.text;

    if (!storyText) {
      throw new Error(
        '❌ Не удалось сгенерировать сценарий — все модели недоступны.\n\n' +
        'Возможные причины:\n' +
        '• Закончились кредиты OpenRouter\n' +
        '• Ключ Gemini API заблокирован\n' +
        '• Превышен лимит запросов\n\n' +
        'Обратитесь к администратору.'
      );
    }

    const workflow = new VideoGenerationWorkflow(params.useFreeModels);
    const promptMappings = await workflow.generateVideoPrompts(
      storyText,
      params.duration
    );
    const prompts = promptMappings.map((m) => m.prompt);

    return { storyText, prompts };
  }

  async run(
    params: GenerationParams,
    onProgress: ProgressCallback,
    signal: AbortSignal,
    storyText?: string,
    prompts?: string[]
  ): Promise<string> {
    let finalStoryText = storyText;
    let finalPrompts = prompts;

    // Stage 1: Story generation (if not provided)
    if (!finalStoryText) {
      if (signal.aborted) throw new Error('Generation cancelled');
      onProgress('story_generation');

      const textGenerator = new TextGeneratorClient(params.useFreeModels);
      const variants = await textGenerator.generateStoryVariants(
        params.description,
        params.duration
      );
      const generatedText = variants[0]?.text;

      if (!generatedText) {
        throw new Error(
          '❌ Не удалось сгенерировать сценарий — все модели недоступны.\n\n' +
          'Возможные причины:\n' +
          '• Закончились кредиты OpenRouter\n' +
          '• Ключ Gemini API заблокирован\n' +
          '• Превышен лимит запросов\n\n' +
          'Обратитесь к администратору.'
        );
      }
      finalStoryText = generatedText;
    }

    // Stage 2: Prompt generation (if not provided)
    if (!finalPrompts) {
      if (signal.aborted) throw new Error('Generation cancelled');
      onProgress('prompt_generation');

      const workflow = new VideoGenerationWorkflow(params.useFreeModels);
      const promptMappings = await workflow.generateVideoPrompts(
        finalStoryText,
        params.duration
      );
      finalPrompts = promptMappings.map((m) => m.prompt);
    }

    const workflow = new VideoGenerationWorkflow(params.useFreeModels);

    // Stage 3: Image generation
    if (signal.aborted) throw new Error('Generation cancelled');
    onProgress('image_generation');

    // Stage 4: Video generation
    if (signal.aborted) throw new Error('Generation cancelled');
    onProgress('video_generation');

    const videoPaths = await workflow.generateVideos(
      finalPrompts,
      params.duration,
      params.aspectRatio,
      [],
      '',
      (current, total) => {
        // Enhanced progress callback with queue status
        onProgress('video_generation', current, total);
      }
    );

    // Stage 5: Audio generation
    if (signal.aborted) throw new Error('Generation cancelled');
    onProgress('audio_generation');

    const audioPath = await workflow.generateAudio(finalStoryText, params.voiceId);

    // Stage 6: Merging
    if (signal.aborted) throw new Error('Generation cancelled');
    onProgress('merging');

    const mergedResult = await workflow.mergeVideos(videoPaths);
    let finalPath = await workflow.addAudioToVideo(
      mergedResult.outputPath,
      audioPath
    );

    // Stage 7: Subtitles (if enabled)
    if (params.withSubtitles) {
      if (signal.aborted) throw new Error('Generation cancelled');
      onProgress('transcription');

      const transcription = await workflow.transcribeAudio(audioPath);
      
      if (signal.aborted) throw new Error('Generation cancelled');
      onProgress('subtitle_generation');

      const subtitlePath = workflow.generateSubtitles(transcription.words, params.aspectRatio);
      finalPath = await workflow.burnSubtitles(finalPath, subtitlePath);
    }

    return finalPath;
  }
}
