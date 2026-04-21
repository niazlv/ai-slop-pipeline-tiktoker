import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useTranslation } from 'react-i18next';
import { DurationSelector } from './DurationSelector';
import { AspectRatioSelector } from './AspectRatioSelector';
import { StoryVariantSelector } from './StoryVariantSelector';
import { ReferenceImagesSelector } from './ReferenceImagesSelector';
import { StyleCustomization } from './StyleCustomization';
import { VoiceSelector } from './VoiceSelector';
import { VideoGeneration } from './VideoGeneration';
import { StepsReview } from './StepsReview';
import { TextGenerationResult } from '../api/text-generator-client';
import { VideoStep, ReferenceImage } from '../types/video-step';

type Step = 'input' | 'selecting-duration' | 'selecting-aspect' | 'selecting-variant' | 'selecting-reference' | 'customizing-style' | 'selecting-voice' | 'reviewing-steps' | 'generating-videos' | 'done';

interface AppProps {
  useFreeModels?: boolean;
  resumeSessionPath?: string;
  onExit: () => void;
}

export const App: React.FC<AppProps> = ({ useFreeModels = false, resumeSessionPath, onExit }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(resumeSessionPath ? 'generating-videos' : 'input');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState<number>(60);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('9:16');
  const [variants, setVariants] = useState<TextGenerationResult[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<TextGenerationResult | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [stylePrompt, setStylePrompt] = useState<string>('');
  const [voiceId, setVoiceId] = useState<string>('3EuKHIEZbSzrHGNmdYsx'); // Default: Josh
  const [videoSteps, setVideoSteps] = useState<VideoStep[]>([]);
  const [sessionPath, setSessionPath] = useState<string>(resumeSessionPath || '');

  const handleDescriptionSubmit = (value: string) => {
    setDescription(value);
    setStep('selecting-duration');
  };

  const handleDurationSelect = (selectedDuration: number) => {
    setDuration(selectedDuration);
    setStep('selecting-aspect');
  };

  const handleAspectRatioSelect = (ratio: '16:9' | '9:16') => {
    setAspectRatio(ratio);
    setStep('selecting-variant');
  };

  const handleVariantSelect = (variant: TextGenerationResult) => {
    setSelectedVariant(variant);
    setStep('selecting-reference');
  };

  const handleReferenceSelect = (images: ReferenceImage[]) => {
    setReferenceImages(images);
    setStep('customizing-style');
  };

  const handleStyleComplete = (style: string) => {
    setStylePrompt(style);
    setStep('selecting-voice');
  };

  const handleVoiceSelect = (selectedVoiceId: string) => {
    setVoiceId(selectedVoiceId);
    setStep('reviewing-steps');
  };

  const handleStepsReviewComplete = (steps: VideoStep[], reviewSessionPath: string) => {
    setVideoSteps(steps);
    setSessionPath(reviewSessionPath);
    setStep('generating-videos');
  };

  const handleComplete = () => {
    setStep('done');
    setTimeout(() => {
      onExit();
    }, 2000);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🎬 {t('app.title')}
        </Text>
      </Box>

      {step === 'input' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text>📝 {t('input.description_label')}</Text>
          </Box>
          <Box>
            <Text color="green">&gt; </Text>
            <TextInput
              value={description}
              onChange={setDescription}
              onSubmit={handleDescriptionSubmit}
              placeholder={t('input.description_placeholder')}
            />
          </Box>
        </Box>
      )}

      {step === 'selecting-duration' && (
        <DurationSelector onSelect={handleDurationSelect} />
      )}

      {step === 'selecting-aspect' && (
        <AspectRatioSelector onSelect={handleAspectRatioSelect} />
      )}

      {step === 'selecting-variant' && (
        <StoryVariantSelector
          description={description}
          duration={duration}
          useFreeModels={useFreeModels}
          onVariantsGenerated={setVariants}
          onSelect={handleVariantSelect}
        />
      )}

      {step === 'selecting-reference' && (
        <ReferenceImagesSelector onComplete={handleReferenceSelect} />
      )}

      {step === 'customizing-style' && (
        <StyleCustomization onComplete={handleStyleComplete} />
      )}

      {step === 'selecting-voice' && (
        <VoiceSelector onSelect={handleVoiceSelect} />
      )}

      {step === 'reviewing-steps' && selectedVariant && (
        <StepsReview
          storyText={selectedVariant.text}
          duration={duration}
          aspectRatio={aspectRatio}
          referenceImages={referenceImages}
          stylePrompt={stylePrompt}
          useFreeModels={useFreeModels}
          onComplete={handleStepsReviewComplete}
        />
      )}

      {step === 'generating-videos' && (resumeSessionPath || selectedVariant) && (
        <VideoGeneration
          storyText={selectedVariant?.text || ''}
          duration={duration}
          aspectRatio={aspectRatio}
          referenceImages={referenceImages}
          stylePrompt={stylePrompt}
          voiceId={voiceId}
          videoSteps={videoSteps}
          useFreeModels={useFreeModels}
          sessionPath={sessionPath}
          onComplete={handleComplete}
        />
      )}

      {step === 'done' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green" bold>✅ {t('done.message')}</Text>
          <Text dimColor>{t('done.exit')}</Text>
        </Box>
      )}
    </Box>
  );
};
