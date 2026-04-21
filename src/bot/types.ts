export type DialogState =
  | 'IDLE'
  | 'AWAITING_DURATION'
  | 'AWAITING_ASPECT_RATIO'
  | 'AWAITING_VOICE'
  | 'AWAITING_MODEL_MODE'
  | 'AWAITING_GENERATION_MODE'
  | 'AWAITING_CONFIRMATION'
  | 'STORY_REVIEW'
  | 'PROMPTS_REVIEW'
  | 'GENERATING';

export interface GenerationParams {
  description: string;
  duration: 15 | 30 | 60;
  aspectRatio: '9:16' | '16:9';
  voiceId: string;
  useFreeModels: boolean;
  generationMode: 'simple' | 'detailed';
  withSubtitles: boolean;
}

export interface UserSession {
  userId: number;
  state: DialogState;
  params: Partial<GenerationParams>;
  progressMessageId?: number;
  abortController?: AbortController;
  startedAt?: Date;
  storyText?: string;
  prompts?: string[];
}

// Callback data prefixes for inline keyboards
export const CALLBACK_PREFIXES = {
  DURATION: 'duration',
  ASPECT: 'aspect',
  VOICE: 'voice',
  MODE: 'mode',
  GEN_MODE: 'gen_mode',
  SUBTITLES: 'subtitles',
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
  STORY_OK: 'story_ok',
  STORY_EDIT: 'story_edit',
  PROMPTS_OK: 'prompts_ok',
  PROMPTS_EDIT: 'prompts_edit',
} as const;
