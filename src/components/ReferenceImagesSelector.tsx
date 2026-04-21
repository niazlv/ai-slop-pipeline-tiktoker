import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import fs from 'fs';
import { useTranslation } from 'react-i18next';
import { ReferenceImage } from '../types/video-step';

interface ReferenceImagesSelectorProps {
  onComplete: (images: ReferenceImage[]) => void;
}

type Stage = 'ask-if-needed' | 'input-path' | 'input-description' | 'confirm-more';

export const ReferenceImagesSelector: React.FC<ReferenceImagesSelectorProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>('ask-if-needed');
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [currentDesc, setCurrentDesc] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (stage === 'ask-if-needed') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>🖼️ Reference Images</Text>
        </Box>
        <Text>Do you want to provide any reference images? (e.g. Logos, Characters, Specific Styles)</Text>
        <Text dimColor>These will be smartly applied to the relevant scenes by the AI.</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: 'Yes, add a reference image', value: 'yes' },
              { label: 'No, skip', value: 'no' }
            ]}
            onSelect={(item) => {
              if (item.value === 'yes') setStage('input-path');
              else onComplete([]);
            }}
          />
        </Box>
      </Box>
    );
  }

  if (stage === 'input-path') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>🖼️ Add Reference Image ({images.length} added so far)</Text>
        </Box>
        {error && <Text color="red">❌ {error}</Text>}
        <Box>
          <Text>📝 Enter absolute path to image file: </Text>
          <TextInput
            value={currentPath}
            onChange={setCurrentPath}
            onSubmit={(value) => {
              if (!value.trim()) {
                setError('Path cannot be empty');
                return;
              }
              const cleanPath = value.replace(/^['"]|['"]$/g, '').trim();
              if (!fs.existsSync(cleanPath)) {
                setError('File not found at specified path');
                return;
              }
              setError(null);
              setCurrentPath(cleanPath);
              setStage('input-description');
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>(e.g. /Users/name/images/logo.png)</Text>
        </Box>
      </Box>
    );
  }

  if (stage === 'input-description') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>📝 Describe the image</Text>
        </Box>
        {error && <Text color="red">❌ {error}</Text>}
        <Box>
          <Text>Description: </Text>
          <TextInput
            value={currentDesc}
            onChange={setCurrentDesc}
            onSubmit={(value) => {
              if (!value.trim()) {
                setError('Description cannot be empty');
                return;
              }
              const newImage: ReferenceImage = {
                id: images.length,
                path: currentPath,
                description: value.trim()
              };
              setImages([...images, newImage]);
              setCurrentPath('');
              setCurrentDesc('');
              setError(null);
              setStage('confirm-more');
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>(e.g. "Company Logo on transparent background" or "Face of the main character")</Text>
          <Text dimColor>The AI will use this description to decide where to place the image.</Text>
        </Box>
      </Box>
    );
  }

  if (stage === 'confirm-more') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="green" bold>✅ Image added!</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Current Reference Images:</Text>
          {images.map((img) => (
            <Text key={img.id}>- {img.description} <Text dimColor>({img.path})</Text></Text>
          ))}
        </Box>
        <Text>Would you like to add another reference image?</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: 'Yes, add another', value: 'yes' },
              { label: 'No, proceed to next step', value: 'no' }
            ]}
            onSelect={(item) => {
              if (item.value === 'yes') setStage('input-path');
              else onComplete(images);
            }}
          />
        </Box>
      </Box>
    );
  }

  return null;
};
