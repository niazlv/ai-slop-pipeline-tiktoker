import fs from 'fs';
import path from 'path';

export interface PipelineStepInfo {
  index: number;
  prompt: string;
  imagePath: string | null;
  imageUrl: string | null;
  videoPath: string | null;
  videoDuration: number;
  // Reference handling
  referenceImageIndex?: number | null;
  referenceAction?: 'direct_use' | 'img2img' | null;
}

export interface PipelineState {
  sessionId: string;
  createdAt: string;
  updatedAt: string;

  // Input parameters
  input: {
    description: string;
    duration: number;
    aspectRatio: string;
    voiceId: string;
    stylePrompt: string;
    referenceImages: Array<{
      id: number;
      path: string;
      description: string;
      url?: string;
    }>;
    useFreeModels: boolean;
  };

  // Audio generation
  audio: {
    storyText: string;
    audioPath: string | null;
    audioUrl: string | null;
    actualDuration: number | null;
    requiredSegments: number | null;
  };

  // Video steps (prompts, images, videos)
  steps: PipelineStepInfo[];

  // Transcription result
  transcription: {
    words: Array<{ text: string; start: number; end: number }>;
    fullText: string;
  } | null;

  // Output paths
  output: {
    mergedVideoPath: string | null;
    videoWithAudioPath: string | null;
    subtitlePath: string | null;
    finalVideoPath: string | null;
  };

  // Completed pipeline steps for resume tracking
  completedSteps: string[];
}

export class PipelineStateManager {
  private state: PipelineState;
  private filePath: string;

  constructor(sessionDir: string, sessionId: string) {
    this.filePath = path.join(sessionDir, 'pipeline-state.json');

    // Load existing state if file exists (for resume scenarios)
    const existing = PipelineStateManager.loadFromFile(this.filePath);
    if (existing) {
      this.state = existing;
      console.log(`💾 Pipeline state loaded from: ${this.filePath} (${existing.completedSteps.length} steps completed)`);
    } else {
      this.state = {
        sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        input: {
          description: '',
          duration: 0,
          aspectRatio: '9:16',
          voiceId: '',
          stylePrompt: '',
          referenceImages: [],
          useFreeModels: false,
        },
        audio: {
          storyText: '',
          audioPath: null,
          audioUrl: null,
          actualDuration: null,
          requiredSegments: null,
        },
        steps: [],
        transcription: null,
        output: {
          mergedVideoPath: null,
          videoWithAudioPath: null,
          subtitlePath: null,
          finalVideoPath: null,
        },
        completedSteps: [],
      };
      console.log(`💾 Pipeline state file: ${this.filePath} (new)`);
    }
  }

  private save(): void {
    this.state.updatedAt = new Date().toISOString();
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  setInput(input: PipelineState['input']): void {
    this.state.input = input;
    this.save();
  }

  updateAudio(audio: Partial<PipelineState['audio']>): void {
    this.state.audio = { ...this.state.audio, ...audio };
    this.save();
  }

  setSteps(steps: PipelineStepInfo[]): void {
    this.state.steps = steps;
    this.save();
  }

  updateStep(index: number, update: Partial<PipelineStepInfo>): void {
    if (this.state.steps[index]) {
      this.state.steps[index] = { ...this.state.steps[index], ...update };
      this.save();
    }
  }

  setTranscription(transcription: PipelineState['transcription']): void {
    this.state.transcription = transcription;
    this.save();
  }

  updateOutput(output: Partial<PipelineState['output']>): void {
    this.state.output = { ...this.state.output, ...output };
    this.save();
  }

  markStepComplete(step: string): void {
    if (!this.state.completedSteps.includes(step)) {
      this.state.completedSteps.push(step);
    }
    this.save();
    console.log(`💾 Pipeline state saved [${step}]: ${this.filePath}`);
  }

  getState(): PipelineState {
    return this.state;
  }

  /**
   * Load existing state from file (for potential resume functionality)
   */
  static loadFromFile(filePath: string): PipelineState | null {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as PipelineState;
      }
    } catch (error) {
      console.warn('⚠️  Failed to load pipeline state:', error);
    }
    return null;
  }
}
