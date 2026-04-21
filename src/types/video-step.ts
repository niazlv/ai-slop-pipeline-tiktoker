export interface ReferenceImage {
  id: number;
  path: string;
  description: string;
  url?: string; // Filled later after uploading to FAL
}

export interface VideoStep {
  index: number;
  prompt: string;
  imagePath: string | null;
  imageUrl: string | null;
  duration: number; // in seconds
  isGenerating: boolean;
  error: string | null;
  
  // Reference handling
  referenceImageIndex?: number | null;
  referenceAction?: 'direct_use' | 'img2img' | null;
}

export interface StepsReviewData {
  steps: VideoStep[];
  referenceImages: ReferenceImage[];
  stylePrompt: string;
  aspectRatio: '16:9' | '9:16';
}
