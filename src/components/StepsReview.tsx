import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { VideoStep, ReferenceImage } from '../types/video-step';
import { FluxClient } from '../api/flux-client';
import { TextGeneratorClient, PromptMapping } from '../api/text-generator-client';
import { SessionManager } from '../utils/session-manager';
import { ImageUploader } from '../utils/image-uploader';
import fs from 'fs';
import path from 'path';

interface StepsReviewProps {
  storyText: string;
  duration: number;
  aspectRatio: '16:9' | '9:16';
  referenceImages: ReferenceImage[];
  stylePrompt: string;
  useFreeModels?: boolean;
  onComplete: (steps: VideoStep[], sessionPath: string) => void;
}

type Stage = 'generating-prompts' | 'prompts-ready' | 'generating-initial' | 'review' | 'regenerating' | 'uploading' | 'complete';
type EditMode = 'none' | 'edit-prompt' | 'edit-duration' | 'upload-image';

export const StepsReview: React.FC<StepsReviewProps> = ({
  storyText,
  duration,
  aspectRatio,
  referenceImages,
  stylePrompt,
  useFreeModels = false,
  onComplete,
}) => {
  const [stage, setStage] = useState<Stage>('generating-prompts');
  const [steps, setSteps] = useState<VideoStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [fluxClient] = useState(() => new FluxClient(undefined, useFreeModels));
  const [textGenerator] = useState(() => new TextGeneratorClient(useFreeModels));
  const [session] = useState(() => new SessionManager());
  const [referenceImageUrls, setReferenceImageUrls] = useState<Map<number, string>>(new Map());
  const [progress, setProgress] = useState('');
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedDuration, setEditedDuration] = useState('');
  const [uploadImagePath, setUploadImagePath] = useState('');

  useEffect(() => {
    const initializeSteps = async () => {
      // Generate prompts first
      setProgress('Generating video prompts...');
      const prompts: PromptMapping[] = await textGenerator.generateVideoPrompts(storyText, duration, referenceImages);
      console.log(`Generated ${prompts.length} prompts`);

      // Upload all reference images
      const urlMap = new Map<number, string>();
      for (const ref of referenceImages) {
        try {
          const url = await ImageUploader.uploadImage(ref.path);
          urlMap.set(ref.id, url);
          console.log(`✅ Uploaded reference #${ref.id}: ${ref.description}`);
        } catch (error) {
          console.error(`Failed to upload reference image #${ref.id}:`, error);
        }
      }
      setReferenceImageUrls(urlMap);

      // Initialize steps from prompts
      const initialSteps: VideoStep[] = prompts.map((mapping, index) => ({
        index,
        prompt: mapping.prompt,
        imagePath: null,
        imageUrl: null,
        duration: 4, // Default duration
        isGenerating: false,
        error: null,
        referenceImageIndex: mapping.referenceImageIndex ?? null,
        referenceAction: mapping.referenceAction ?? null,
      }));

      setSteps(initialSteps);

      // Show prompts for review first (don't generate images yet)
      setStage('prompts-ready');
    };

    initializeSteps();
  }, []);

  const generateAllImages = async (stepsToGenerate: VideoStep[]) => {
    const promises = stepsToGenerate.map(async (step, index) => {
      try {
        // Skip if image already generated
        if (step.imageUrl) {
          return;
        }

        const imagePath = session.getImagePath(index + 1);
        let imageUrl: string;

        // Handle direct_use: use the uploaded reference image directly
        if (step.referenceAction === 'direct_use' && step.referenceImageIndex != null) {
          const refUrl = referenceImageUrls.get(step.referenceImageIndex);
          if (refUrl) {
            imageUrl = refUrl;
            // Copy the reference image to session folder
            const refImage = referenceImages.find(r => r.id === step.referenceImageIndex);
            if (refImage) {
              fs.copyFileSync(refImage.path, imagePath);
            }
            console.log(`🖼️ Step ${index + 1}: Using reference #${step.referenceImageIndex} directly (no Flux)`);
          } else {
            // Fallback to normal generation
            imageUrl = await fluxClient.generateImage(step.prompt, imagePath, aspectRatio, undefined, stylePrompt || undefined);
          }
        } else {
          // img2img or no reference
          const refUrl = (step.referenceAction === 'img2img' && step.referenceImageIndex != null)
            ? referenceImageUrls.get(step.referenceImageIndex)
            : undefined;
          imageUrl = await fluxClient.generateImage(step.prompt, imagePath, aspectRatio, refUrl || undefined, stylePrompt || undefined);
        }

        setSteps((prev) => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            imagePath,
            imageUrl,
            isGenerating: false,
          };
          return updated;
        });

        setProgress(`Generated ${index + 1}/${stepsToGenerate.length} images`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setSteps((prev) => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            isGenerating: false,
            error: errorMessage,
          };
          return updated;
        });
      }
    });

    await Promise.all(promises);
  };

  const handleRegenerateImage = async (stepIndex: number, prompt: string) => {
    setStage('regenerating');
    setSteps((prev) => {
      const updated = [...prev];
      updated[stepIndex] = { ...updated[stepIndex], isGenerating: true, error: null };
      return updated;
    });

    try {
      const imagePath = session.getImagePath(stepIndex + 1);
      const step = steps[stepIndex];
      let refUrl: string | undefined;
      if (step?.referenceAction === 'img2img' && step?.referenceImageIndex != null) {
        refUrl = referenceImageUrls.get(step.referenceImageIndex) || undefined;
      }
      const imageUrl = await fluxClient.generateImage(
        prompt,
        imagePath,
        aspectRatio,
        refUrl,
        stylePrompt || undefined
      );

      setSteps((prev) => {
        const updated = [...prev];
        updated[stepIndex] = {
          ...updated[stepIndex],
          imagePath,
          imageUrl,
          isGenerating: false,
        };
        return updated;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSteps((prev) => {
        const updated = [...prev];
        updated[stepIndex] = {
          ...updated[stepIndex],
          isGenerating: false,
          error: errorMessage,
        };
        return updated;
      });
    }

    setStage('review');
  };

  const handleUploadImage = async (stepIndex: number, imagePath: string) => {
    setStage('uploading');

    if (!fs.existsSync(imagePath)) {
      setSteps((prev) => {
        const updated = [...prev];
        updated[stepIndex] = {
          ...updated[stepIndex],
          error: 'File not found',
        };
        return updated;
      });
      setStage('review');
      return;
    }

    try {
      // Copy image to session folder
      const destPath = session.getImagePath(stepIndex + 1);
      fs.copyFileSync(imagePath, destPath);

      // Upload to get URL
      const imageUrl = await ImageUploader.uploadImage(destPath);

      setSteps((prev) => {
        const updated = [...prev];
        updated[stepIndex] = {
          ...updated[stepIndex],
          imagePath: destPath,
          imageUrl,
          error: null,
        };
        return updated;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSteps((prev) => {
        const updated = [...prev];
        updated[stepIndex] = {
          ...updated[stepIndex],
          error: errorMessage,
        };
        return updated;
      });
    }

    setStage('review');
  };

  const handleUpdateStep = (updatedStep: VideoStep) => {
    setSteps((prev) => {
      const updated = [...prev];
      updated[updatedStep.index] = updatedStep;
      return updated;
    });
  };

  const handleComplete = async () => {
    // Check if there are steps without images
    const stepsWithoutImages = steps.filter(step => !step.imageUrl);

    if (stepsWithoutImages.length > 0) {
      // Generate missing images
      setStage('generating-initial');
      setProgress(`Generating ${stepsWithoutImages.length} remaining images...`);
      await generateAllImages(steps);
    }

    setStage('complete');
    onComplete(steps, session.getPaths().root);
  };

  if (stage === 'generating-prompts') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>Generating Video Prompts</Text>
        <Box marginTop={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> {progress}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Please wait...</Text>
        </Box>
      </Box>
    );
  }

  if (stage === 'prompts-ready') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>✅ Generated prompts: {steps.length} - {((Date.now() - 0) / 1000).toFixed(1)}s</Text>

        <Box flexDirection="column" marginTop={1}>
          {steps.map((step, index) => (
            <Box key={index} flexDirection="column" marginBottom={1}>
              <Text color="white">
                {index + 1}. {step.prompt.substring(0, 80)}...
              </Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1} paddingX={1} paddingY={0} borderStyle="single" borderColor="cyan">
          <Text color="cyan">Ready to generate images for all steps</Text>
        </Box>

        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: '🎨 Start Generating Images', value: 'start' },
              { label: '✏️ Review & Edit Prompts First', value: 'review' },
            ]}
            onSelect={async (item) => {
              if (item.value === 'start') {
                setStage('generating-initial');
                setProgress(`Generating ${steps.length} images...`);
                await generateAllImages(steps);
                setStage('review');
              } else if (item.value === 'review') {
                setStage('review');
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (stage === 'generating-initial') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>Generating Images for Steps</Text>
        <Box marginTop={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> {progress}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Please wait...</Text>
        </Box>
      </Box>
    );
  }

  if (stage === 'regenerating' || stage === 'uploading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>Processing...</Text>
        <Box marginTop={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> {stage === 'regenerating' ? 'Regenerating image...' : 'Uploading image...'}</Text>
        </Box>
      </Box>
    );
  }

  const currentStep = steps[currentStepIndex];

  // Edit Prompt mode
  if (editMode === 'edit-prompt') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>Edit Prompt (Step {currentStepIndex + 1}/{steps.length})</Text>
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
          <Text dimColor>Current: {currentStep?.prompt}</Text>
          <Box marginTop={1}>
            <Text>New prompt: </Text>
            <TextInput
              value={editedPrompt}
              onChange={setEditedPrompt}
              onSubmit={() => {
                setSteps((prev) => {
                  const updated = [...prev];
                  updated[currentStepIndex] = {
                    ...updated[currentStepIndex],
                    prompt: editedPrompt,
                  };
                  return updated;
                });
                setEditMode('none');
              }}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to save, Ctrl+C to cancel</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Edit Duration mode
  if (editMode === 'edit-duration') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>Edit Duration (Step {currentStepIndex + 1}/{steps.length})</Text>
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
          <Text dimColor>Current: {currentStep?.duration}s</Text>
          <Box marginTop={1}>
            <Text>New duration (seconds): </Text>
            <TextInput
              value={editedDuration}
              onChange={setEditedDuration}
              onSubmit={() => {
                const duration = parseInt(editedDuration, 10);
                if (!isNaN(duration) && duration > 0) {
                  setSteps((prev) => {
                    const updated = [...prev];
                    updated[currentStepIndex] = {
                      ...updated[currentStepIndex],
                      duration,
                    };
                    return updated;
                  });
                }
                setEditMode('none');
              }}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to save, Ctrl+C to cancel</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Upload Image mode
  if (editMode === 'upload-image') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>Upload Custom Image (Step {currentStepIndex + 1}/{steps.length})</Text>
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
          <Box>
            <Text>Image path: </Text>
            <TextInput
              value={uploadImagePath}
              onChange={setUploadImagePath}
              onSubmit={async () => {
                setEditMode('none');
                await handleUploadImage(currentStepIndex, uploadImagePath);
                setUploadImagePath('');
              }}
              placeholder="/path/to/image.jpg"
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to upload, Ctrl+C to cancel</Text>
          </Box>
        </Box>
      </Box>
    );
  }
  const actions = [
    { label: '✅ Complete & Continue (Skip Review)', value: 'complete' },
    currentStepIndex < steps.length - 1
      ? { label: '➡️ Next Step', value: 'next' }
      : null,
    { label: '✏️ Edit Prompt', value: 'edit-prompt' },
    { label: `⏱️ Edit Duration (${currentStep?.duration || 4}s)`, value: 'edit-duration' },
    { label: '🔄 Regenerate Image', value: 'regenerate' },
    { label: '📤 Upload Custom Image', value: 'upload' },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  if (currentStepIndex > 0) {
    actions.splice(1, 0, { label: '⬅️ Previous Step', value: 'prev' });
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan" bold>Review Steps ({currentStepIndex + 1}/{steps.length})</Text>

      {currentStep && (
        <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1} marginTop={1}>
          <Text bold color="cyan">Step {currentStep.index + 1}</Text>

          <Box marginTop={1}>
            <Text dimColor>Prompt: </Text>
            <Text>{currentStep.prompt}</Text>
          </Box>

          <Box marginTop={1}>
            <Text dimColor>Duration: </Text>
            <Text color="yellow">{currentStep.duration}s</Text>
          </Box>

          {currentStep.imagePath && (
            <Box marginTop={1}>
              <Text color="green">Image: {path.basename(currentStep.imagePath)}</Text>
            </Box>
          )}

          {currentStep.isGenerating && (
            <Box marginTop={1}>
              <Text color="yellow">
                <Spinner type="dots" /> Generating...
              </Text>
            </Box>
          )}

          {currentStep.error && (
            <Box marginTop={1}>
              <Text color="red">Error: {currentStep.error}</Text>
            </Box>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Select action:</Text>
      </Box>

      <SelectInput
        items={actions}
        onSelect={async (item) => {
          if (item.value === 'prev') {
            setCurrentStepIndex(Math.max(0, currentStepIndex - 1));
          } else if (item.value === 'next') {
            setCurrentStepIndex(Math.min(steps.length - 1, currentStepIndex + 1));
          } else if (item.value === 'edit-prompt') {
            setEditedPrompt(currentStep.prompt);
            setEditMode('edit-prompt');
          } else if (item.value === 'edit-duration') {
            setEditedDuration(currentStep.duration.toString());
            setEditMode('edit-duration');
          } else if (item.value === 'regenerate') {
            await handleRegenerateImage(currentStepIndex, currentStep.prompt);
          } else if (item.value === 'upload') {
            setEditMode('upload-image');
          } else if (item.value === 'complete') {
            handleComplete();
          }
        }}
      />
    </Box>
  );
};
