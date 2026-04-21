export type DialogState =
  | 'IDLE'
  | 'AWAITING_DURATION'
  | 'AWAITING_ASPECT_RATIO'
  | 'AWAITING_VOICE'
  | 'AWAITING_MODEL_MODE'
  | 'AWAITING_CONFIRMATION'
  | 'GENERATING';

export interface GenerationParams {
  description: string;
  duration: 15 | 30 | 60;
  aspectRatio: '9:16' | '16:9';
  voiceId: string;
  useFreeModels: boolean;
}

export interface UserSession {
  userId: number;
  state: DialogState;
  params: Partial<GenerationParams>;
  progressMessageId?: number;
  abortController?: AbortController;
  startedAt?: Date;
}

// Callback data prefixes for inline keyboards
export const CALLBACK_PREFIXES = {
  DURATION: 'duration',
  ASPECT: 'aspect',
  VOICE: 'voice',
  MODE: 'mode',
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
} as const;
