import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useTranslation } from 'react-i18next';
import { VideoGenerationWorkflow } from '../workflows/video-generation-workflow';
import { VideoStep, ReferenceImage } from '../types/video-step';
import { CostBreakdown } from '../utils/cost-calculator';
import { getAudioDuration } from '../utils/audio-duration';
import { PipelineStateManager } from '../utils/pipeline-state';
import { PromptMapping } from '../api/text-generator-client';

interface VideoGenerationProps {
  storyText: string;
  duration: number;
  aspectRatio: '16:9' | '9:16';
  referenceImages: ReferenceImage[];
  stylePrompt: string;
  voiceId: string;
  videoSteps?: VideoStep[];
  useFreeModels?: boolean;
  sessionPath?: string;
  onComplete: () => void;
}

type Stage =
  | 'generating-prompts'
  | 'generating-images'
  | 'generating-videos'
  | 'generating-audio'
  | 'merging-videos'
  | 'adding-audio'
  | 'transcribing'
  | 'burning-subtitles'
  | 'complete'
  | 'error';

export const VideoGeneration: React.FC<VideoGenerationProps> = ({ storyText, duration, aspectRatio, referenceImages, stylePrompt, voiceId, videoSteps, useFreeModels = false, sessionPath, onComplete }) => {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>('generating-audio');
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [finalVideoPath, setFinalVideoPath] = useState<string>('');
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown | null>(null);

  useEffect(() => {
    const runWorkflow = async () => {
      try {
        const workflow = new VideoGenerationWorkflow(useFreeModels, sessionPath);
        const session = workflow.getSession();

        // Initialize pipeline state manager
        const pipelineState = new PipelineStateManager(
          session.getPaths().root,
          session.getSessionId()
        );

        // Resume state variables
        let actualAudioDuration = 0;
        let requiredSegments = 0;
        let audioPath = '';
        let prompts: string[] = [];
        let videoPaths: string[] = [];
        let mergedVideoPath = '';
        let videoWithAudioPath = '';
        let transcription: { words: any[]; fullText: string } = { words: [], fullText: '' };
        let subtitlePath = '';
        let finalPath = '';

        let shouldSkipAudio = false;
        let shouldSkipPrompts = false;
        let shouldSkipVideos = false;
        let shouldSkipMerge = false;
        let shouldSkipAddAudio = false;
        let shouldSkipTranscribe = false;
        let shouldSkipSubtitles = false;

        const stateFile = session.getPipelineStatePath();
        const existingState = PipelineStateManager.loadFromFile(stateFile);

        if (existingState && sessionPath) {
          console.log('\n🔄 Resuming from existing pipeline state...');
          const { completedSteps, audio, steps, output, transcription: loadedTranscription } = existingState;
          
          if (completedSteps.includes('audio')) {
            shouldSkipAudio = true;
            audioPath = audio.audioPath!;
            actualAudioDuration = audio.actualDuration!;
            requiredSegments = audio.requiredSegments!;
          }
          if (completedSteps.includes('prompts')) {
            shouldSkipPrompts = true;
            prompts = steps.map(s => s.prompt);
          }
          if (completedSteps.includes('videos')) {
            shouldSkipVideos = true;
            videoPaths = steps.map(s => s.videoPath as string);
          }
          if (completedSteps.includes('merge')) {
            shouldSkipMerge = true;
            mergedVideoPath = output.mergedVideoPath!;
          }
          if (completedSteps.includes('add-audio')) {
            shouldSkipAddAudio = true;
            videoWithAudioPath = output.videoWithAudioPath || output.finalVideoPath || '';
          }
          if (completedSteps.includes('transcribe')) {
            shouldSkipTranscribe = true;
            transcription = loadedTranscription!;
          }
          if (completedSteps.includes('subtitles')) {
            shouldSkipSubtitles = true;
            subtitlePath = output.subtitlePath!;
            finalPath = output.finalVideoPath!;
          }
        } else {
          // Save input parameters if fresh start
          pipelineState.setInput({
            description: storyText.substring(0, 200),
            duration,
            aspectRatio,
            voiceId,
            stylePrompt,
            referenceImages: referenceImages.map(r => ({ id: r.id, path: r.path, description: r.description })),
            useFreeModels: useFreeModels,
          });
        }

        const segmentDuration = 4; // seconds per video segment

        // ==========================================
        // STEP 1: Generate audio FIRST
        // ==========================================
        if (shouldSkipAudio) {
          console.log(`\n⏭️  Skipping audio generation (already done): ${audioPath}`);
        } else {
          setStage('generating-audio');
          setProgress('Generating audio narration...');
          audioPath = await workflow.generateAudio(storyText, voiceId);
          console.log(`\n✅ Audio created: ${audioPath}\n`);

          actualAudioDuration = await getAudioDuration(audioPath);
          console.log(`\n📏 Actual audio duration: ${actualAudioDuration.toFixed(1)}s (requested: ${duration}s)\n`);

          requiredSegments = Math.ceil(actualAudioDuration / segmentDuration);
          console.log(`📊 Required video segments: ${requiredSegments} (${segmentDuration}s each = ${requiredSegments * segmentDuration}s total video)\n`);

          pipelineState.updateAudio({
            storyText,
            audioPath,
            actualDuration: actualAudioDuration,
            requiredSegments,
          });
          pipelineState.markStepComplete('audio');
        }

        // ==========================================
        // STEP 2: Generate or adjust prompts
        // ==========================================
        if (shouldSkipPrompts) {
          console.log(`\n⏭️  Skipping prompts generation (already done)`);
        } else {
          if (!videoSteps || videoSteps.length === 0) {
            setStage('generating-prompts');
            setProgress(t('generation.title'));
            const mappings = await workflow.generateVideoPrompts(storyText, actualAudioDuration, referenceImages);
            console.log(`\n✅ Created ${mappings.length} prompts\n`);

            videoSteps = mappings.map((m, idx) => ({
              index: idx,
              prompt: m.prompt,
              imagePath: null,
              imageUrl: null,
              duration: segmentDuration,
              isGenerating: false,
              error: null,
              referenceImageIndex: m.referenceImageIndex ?? null,
              referenceAction: m.referenceAction ?? null,
            }));
          } else {
            console.log(`\n📝 Using ${videoSteps.length} prepared steps`);
          }

          // Adjust prompt count considering banner
          const hasBanner = videoSteps.some(s => s.referenceAction === 'direct_use' && s.referenceImageIndex != null);
          let mainRequired = requiredSegments;
          if (hasBanner) {
            mainRequired = Math.max(1, Math.ceil((actualAudioDuration - 4) / segmentDuration));
            console.log(`📊 Banner detected. Adjusting main required segments to ${mainRequired}`);
          }

          const bannerStep = videoSteps.find(s => s.referenceAction === 'direct_use' && s.referenceImageIndex != null);
          let mainSteps = videoSteps.filter(s => s !== bannerStep);

          if (mainSteps.length < mainRequired) {
            console.log(`⚠️  Need ${mainRequired} main segments but have ${mainSteps.length}. Adding ${mainRequired - mainSteps.length} more by cycling.`);
            while (mainSteps.length < mainRequired) {
              const lastStep = mainSteps[mainSteps.length - 1] || { prompt: 'Cinematic scene', duration: segmentDuration };
              mainSteps.push({ ...lastStep, index: mainSteps.length });
            }
          } else if (mainSteps.length > mainRequired) {
            console.log(`⚠️  Have ${mainSteps.length} main segments but only need ${mainRequired}. Trimming.`);
            mainSteps = mainSteps.slice(0, mainRequired);
          }

          if (bannerStep) {
             bannerStep.index = mainSteps.length;
             mainSteps.push(bannerStep);
          }
          videoSteps = mainSteps;
          prompts = videoSteps.map(s => s.prompt);

          pipelineState.setSteps(prompts.map((prompt, index) => ({
            index,
            prompt,
            imagePath: videoSteps?.[index]?.imagePath || null,
            imageUrl: videoSteps?.[index]?.imageUrl || null,
            videoPath: null,
            videoDuration: segmentDuration,
          })));
          pipelineState.markStepComplete('prompts');
          console.log(`✅ Final prompt count: ${prompts.length} (covers ${mainRequired * segmentDuration}s of video)\n`);
        }

        // ==========================================
        // STEP 3: Generate videos
        // ==========================================
        if (shouldSkipVideos) {
          console.log(`\n⏭️  Skipping videos generation (already done)`);
        } else {
          setStage('generating-videos');
          setProgress(`Generating ${prompts.length} videos...`);

          videoPaths = await workflow.generateVideos(
            prompts,
            actualAudioDuration,
            aspectRatio,
            referenceImages,
            stylePrompt,
            (current, total) => {
              setProgress(`Generation and saving: ${current}/${total} videos completed...`);
            },
            videoSteps
          );

          videoPaths.forEach((vp, i) => {
            pipelineState.updateStep(i, { videoPath: vp });
          });
          pipelineState.markStepComplete('videos');
          console.log(`\n✅ Generated and saved ${videoPaths.length} videos!\n`);
        }

        // ==========================================
        // STEP 4: Merge videos
        // ==========================================
        if (shouldSkipMerge) {
          console.log(`\n⏭️  Skipping videos merge (already done)`);
        } else {
          setStage('merging-videos');

          const mainVideoPaths: string[] = [];
          let bannerVideoPath: string | null = null;
          
          videoSteps?.forEach((step, i) => {
             if (step.referenceAction === 'direct_use' && step.referenceImageIndex != null) {
                bannerVideoPath = videoPaths[i];
             } else {
                mainVideoPaths.push(videoPaths[i]);
             }
          });
          
          if (!bannerVideoPath) {
             setProgress('Merging videos into one...');
             const mergeResult = await workflow.mergeVideos(mainVideoPaths.length > 0 ? mainVideoPaths : videoPaths);
             mergedVideoPath = mergeResult.outputPath;
          } else {
             setProgress('Merging main videos...');
             // If there's only 1 main video, it will still output through mergeVideos properly
             const mergeResult = await workflow.mergeVideos(mainVideoPaths.length > 0 ? mainVideoPaths : [videoPaths[0]]);
             
             setProgress('Adding outro banner with crossfade...');
             const crossfadeResult = await workflow.mergeWithCrossfade(
                 mergeResult.outputPath, 
                 bannerVideoPath, 
                 mergeResult.duration, 
                 1
             );
             mergedVideoPath = crossfadeResult.outputPath;
          }

          pipelineState.updateOutput({ mergedVideoPath });
          pipelineState.markStepComplete('merge');
          console.log(`\n✅ Videos merged: ${mergedVideoPath}\n`);
        }

        // ==========================================
        // STEP 5: Add audio
        // ==========================================
        if (shouldSkipAddAudio) {
          console.log(`\n⏭️  Skipping adding audio (already done)`);
        } else {
          setStage('adding-audio');
          setProgress('Adding audio to video...');
          videoWithAudioPath = await workflow.addAudioToVideo(mergedVideoPath, audioPath);
          pipelineState.updateOutput({ videoWithAudioPath });
          pipelineState.markStepComplete('add-audio');
          console.log(`\n✅ Audio added: ${videoWithAudioPath}\n`);
        }

        // ==========================================
        // STEP 6: Transcribe audio for subtitles
        // ==========================================
        if (shouldSkipTranscribe) {
          console.log(`\n⏭️  Skipping audio transcription (already done)`);
        } else {
          setStage('transcribing');
          setProgress('Transcribing audio for subtitles...');
          transcription = await workflow.transcribeAudio(audioPath);
          pipelineState.setTranscription(transcription);
          pipelineState.markStepComplete('transcribe');
          console.log(`\n✅ Transcription complete: ${transcription.words.length} words\n`);
        }

        // ==========================================
        // STEP 7: Generate and burn subtitles
        // ==========================================
        if (shouldSkipSubtitles) {
          console.log(`\n⏭️  Skipping subtitle burning (already done)`);
        } else {
          setStage('burning-subtitles');
          setProgress('Generating and burning subtitles...');

          subtitlePath = workflow.generateSubtitles(transcription.words, aspectRatio);
          pipelineState.updateOutput({ subtitlePath });
          console.log(`\n✅ Subtitles generated: ${subtitlePath}`);

          finalPath = await workflow.burnSubtitles(videoWithAudioPath, subtitlePath);
          pipelineState.updateOutput({ finalVideoPath: finalPath });
          pipelineState.markStepComplete('subtitles');
          console.log(`\n✅ Final video with subtitles: ${finalPath}\n`);
        }

        // Show session summary
        workflow.getSession().printSummary();

        // Get cost breakdown
        const costCalc = workflow.getCostCalculator();
        const breakdown = costCalc.calculateCost();
        setCostBreakdown(breakdown);
        costCalc.printCostBreakdown();

        setFinalVideoPath(finalPath);
        setStage('complete');
        setTimeout(() => {
          onComplete();
        }, 1000);
      } catch (err) {
        console.error('❌ Workflow error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStage('error');
      }
    };

    runWorkflow();
  }, [storyText, onComplete]);

  const getStageEmoji = (currentStage: Stage): string => {
    const emojis: Record<Stage, string> = {
      'generating-prompts': '📝',
      'generating-images': '🖼️',
      'generating-videos': '🎬',
      'generating-audio': '🔊',
      'merging-videos': '🎞️',
      'adding-audio': '🎵',
      'transcribing': '🎙️',
      'burning-subtitles': '📝',
      'complete': '✅',
      'error': '❌',
    };
    return emojis[currentStage] || '⏳';
  };

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">❌ {t('generation.error')} {error}</Text>
      </Box>
    );
  }

  if (stage === 'complete') {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>✅ {t('generation.complete')}</Text>
        <Text>📁 {t('generation.file')} {finalVideoPath}</Text>

        {costBreakdown && (
          <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" padding={1}>
            <Text color="cyan" bold>💰 {t('cost.title')}</Text>

            {costBreakdown.details.images.count > 0 && (
              <Box marginTop={1}>
                <Text dimColor>🖼️  {t('cost.images')}: </Text>
                <Text color="yellow">{costBreakdown.details.images.count} × ${costBreakdown.imageGeneration.toFixed(4)}</Text>
              </Box>
            )}

            {costBreakdown.details.videos.count > 0 && (
              <Box marginTop={1}>
                <Text dimColor>🎬 {t('cost.videos')}: </Text>
                <Text color="yellow">{costBreakdown.details.videos.count} × ${costBreakdown.videoGeneration.toFixed(4)}</Text>
              </Box>
            )}

            {costBreakdown.details.audio.characters > 0 && (
              <Box marginTop={1}>
                <Text dimColor>🔊 {t('cost.audio')}: </Text>
                <Text color="yellow">{costBreakdown.details.audio.characters} chars × ${costBreakdown.audioGeneration.toFixed(4)}</Text>
              </Box>
            )}

            <Box marginTop={1}>
              <Text color="green" bold>💵 {t('cost.total')}: ${costBreakdown.total.toFixed(4)}</Text>
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyan" bold>🎬 {t('generation.title')}</Text>
      </Box>

      <Box>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text> {getStageEmoji(stage)} {progress}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{t('generation.wait')}</Text>
      </Box>
    </Box>
  );
};
