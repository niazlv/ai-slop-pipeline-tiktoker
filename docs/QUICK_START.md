# Quick Start Guide

## Installation

### Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** - [Download](https://nodejs.org/)
- **FFmpeg** - Required for video processing
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: [Download from ffmpeg.org](https://ffmpeg.org/download.html)
- **API Keys**:
  - [FAL.AI API Key](https://fal.ai/dashboard)
  - [OpenRouter API Key](https://openrouter.ai/keys)
  - [Google Gemini API Key](https://aistudio.google.com/app/apikey) (optional, for better reliability)

### Install Dependencies

```bash
npm install
```

## Running the Application

### Development Mode (Recommended)

```bash
# Standard mode (premium models, best quality)
npm run dev

# Free mode (save costs)
npm run dev -- --free
```

### Build and Run

```bash
npm run build

# Standard mode
npm start

# Free mode
npm start -- --free
```

### Mode Comparison

| Mode | Models | Quality | Cost |
|------|--------|---------|------|
| Standard | Veo 3.1 Fast + Flux Schnell + ChatGPT | High | $$$ |
| FREE | Seedance Lite + Flux LoRA + Grok 4.1 Free | Medium | $ |

## How to Use

### Step-by-Step Workflow

**1. Launch the app**

```bash
npm run dev
```

**2. Enter a description**

Examples:
- "a story about truck drivers"
- "an astronaut's adventure on Mars"
- "a day in the life of a programmer"

**3. Select video duration**

Choose from: 6, 12, 30, 45, or 60 seconds

**4. Choose aspect ratio**

- **9:16** (vertical) - TikTok, Instagram Reels, YouTube Shorts
- **16:9** (horizontal) - YouTube, desktop viewing

**5. Wait for text variants**

The app generates 3 story variants in parallel (~10-20 seconds)

Options:
- Select a variant (↑↓ arrows + Enter)
- "🔄 Regenerate variants" - Create 3 new options
- "✏️ Enter custom text" - Write your own story

**6. Reference image (optional)**

- **Skip** - Press Enter to skip
- **Enter path** - Use local file or URL for consistent visual style

Example: `/path/to/character.png`

**7. Customize style**

Choose from:
- 20 built-in presets (Photorealistic, Anime, Cyberpunk, etc.)
- "Create custom style" - Define your own
- "No style" - Use default

Custom styles are automatically saved to `styles.json`

**8. Select voice**

Choose narrator voice:
- **Josh** (Male, Deep) - Serious narration
- **Rachel** (Female, Calm) - Universal
- **Clyde** (Male, Medium) - Energetic and clear
- **✏️ Custom Voice ID** - Use any ElevenLabs voice

**9. Wait for generation**

The app will:
- Generate prompts (~5-10s)
- Create images and videos in parallel (~2-5 min)
- Generate audio in parallel (~30-60s)
- Merge videos (~30s)
- Add audio (~30s)

**Total time: 3-6 minutes**

**10. Find your video**

Location: `./output/session_<timestamp>/result/final_video_<timestamp>.mp4`

## What Happens Under the Hood

### 1. Session Creation
A unique folder is created: `output/session_<timestamp>/`

### 2. Text Generation
Claude/Grok generates 3 story variants in parallel

### 3. Prompt Generation
Story is split into video segments with descriptive prompts

### 4. Parallel Image & Video Generation
For each prompt:
- Generate image via Flux
- Create 4-second video via Veo 3 (or 5s via Seedance in FREE mode)
- **Immediately save to videos/ folder**
- **Auto-retry** - Up to 3 attempts on errors (3s → 6s → 12s)

### 5. Audio Generation
Text is narrated via ElevenLabs (parallel with videos)

### 6. Video Merging
All videos are concatenated into one

### 7. Finalization
Audio is added to the final video

## Session Folder Structure

After generation:

```
output/session_2025-01-23T12-30-45/
├── images/              # Generated images
│   ├── image_1.png
│   ├── image_2.png
│   └── ...
├── videos/              # Downloaded videos
│   ├── video_1.mp4
│   ├── video_2.mp4
│   └── ...
├── audio/               # Narration
│   └── narration_<timestamp>.mp3
├── result/              # Final outputs
│   ├── merged_video_<timestamp>.mp4
│   └── final_video_<timestamp>.mp4  # ⭐ FINAL VIDEO
└── metadata.json        # Session metadata
```

## Estimated Generation Time

### Sequential Generation (Old v1.3.1)
- 8-10 videos × 2-5 min = 16-50 minutes for videos only
- **Total: 25-60 minutes**

### Parallel Generation (Current v1.5.1)
- Text generation: ~10-30 seconds
- Prompt generation: ~5-15 seconds
- **In Parallel:**
  - All videos generation & saving: ~2-5 minutes (simultaneous!)
  - Audio generation: ~30-60 seconds
- Merging & finalization: ~30-60 seconds

**Total: 3-6 minutes depending on video count** ⚡

> **5-10x speedup** thanks to parallel generation and immediate saving!

## Verify API Keys

Ensure your `.env` file has valid keys:

```env
FAL_API_KEY="your_fal_key"
OPENROUTER_API_KEY="your_openrouter_key"
GOOGLE_GEMINI_API_KEY="your_gemini_key"  # Optional but recommended
```

## System Requirements

- Node.js 18+
- FFmpeg
- Stable internet connection
- Sufficient API quota for parallel requests

## Troubleshooting

### FFmpeg Not Found

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

### API Errors

Check:
1. API keys are correct in `.env`
2. You have sufficient API quota
3. Internet connection is stable

### Video Generation Fails

The app will:
- Auto-retry up to 3 times
- Continue with successful videos if some fail
- Show detailed error reports

If all videos fail:
1. Check API keys
2. Verify API quota
3. Try free mode: `npm run dev -- --free`

## Next Steps

- [Environment Guide](ENV_GUIDE.md) - Configure models and costs
- [Style Guide](STYLES_GUIDE.md) - Create custom styles
- [Performance Guide](PERFORMANCE.md) - Understand optimizations
- [API Reference](API_REFERENCE.md) - Deep dive into the code
