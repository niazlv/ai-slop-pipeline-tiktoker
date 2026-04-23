# Retry Mechanism Guide 🔄

## Overview

TikToker includes a robust retry mechanism to handle temporary API failures and network issues. This ensures reliable video generation even when individual API calls fail.

## The Problem

When generating 10+ videos in parallel, various errors can occur:

- **Network issues:** Temporary connection drops
- **Rate limiting:** API throttling
- **Timeouts:** Image upload delays
- **API errors:** Temporary processing failures on FAL.AI side
- **Content policy violations:** Prompt blocked by moderation

**Without retry:** A single error breaks the entire pipeline, forcing manual restart.

**With retry:** Each video automatically retries up to 3 times with increasing delays.

## How It Works

### RetryHelper Utility

Located in `src/utils/retry-helper.ts`, this utility implements retry logic with exponential backoff:

```typescript
await RetryHelper.retry(
  async () => {
    // Your code that might fail
    return await someApiCall();
  },
  {
    maxAttempts: 3,        // Maximum retry attempts
    delayMs: 3000,         // Initial delay (3 seconds)
    backoffMultiplier: 2,  // Delay multiplier (×2 each time)
    onRetry: (attempt, error) => {
      console.log(`Attempt ${attempt} failed: ${error.message}`);
    }
  }
);
```

### Exponential Backoff

Delays between attempts increase exponentially:

- **Attempt 1:** Immediate
- **Attempt 2:** After 3 seconds
- **Attempt 3:** After 6 seconds
- **Attempt 4:** After 12 seconds (if maxAttempts = 4)

This gives APIs time to recover from temporary issues.

## Video Generation with Retry

In `src/workflows/video-generation-workflow.ts`, each video is wrapped in retry logic:

```typescript
const videoPromises = prompts.map(async (prompt, i) => {
  return await RetryHelper.retry(
    async () => {
      // Generate image
      const imageUrl = await this.fluxClient.generateImage(...);

      // Generate video
      const result = await this.veo3Client.generateVideo(...);

      // Save immediately
      await this.videoDownloader.downloadVideo(result.videoUrl, path);

      return { index: i, path, success: true };
    },
    {
      maxAttempts: 3,
      delayMs: 3000,
      backoffMultiplier: 2,
      onRetry: (attempt, error) => {
        console.log(`⚠️  Video ${i + 1}: attempt ${attempt}/3 failed`);
        console.log(`   Error: ${error.message}`);
        console.log(`   🔄 Retrying in ${3000 * Math.pow(2, attempt - 1)}ms...`);
      }
    }
  );
});

await Promise.all(videoPromises);
```

## Example Logs

### Successful Retry

```
🎬 Launching video 5/10 generation...
📝 Prompt: A futuristic cityscape at night with neon lights...

❌ API Error: Request timeout

⚠️  Video 5: attempt 1/3 failed
   Error: Request timeout
   🔄 Retrying in 3000ms...

🎬 Retrying video 5 generation...
✅ Video 5 ready: https://fal.ai/files/video_5.mp4 (5/10)
💾 Video 5 saved: output/session.../videos/video_5.mp4
```

### All Attempts Failed

```
⚠️  Video 5: attempt 1/3 failed
   Error: Content could not be processed
   🔄 Retrying in 3000ms...

⚠️  Video 5: attempt 2/3 failed
   Error: Content could not be processed
   🔄 Retrying in 6000ms...

⚠️  Video 5: attempt 3/3 failed
   Error: Content could not be processed

❌ Video 5 FAILED after all attempts
   Error: Content could not be processed
   Prompt: A hustler in a dark alley...

⚠️  Continuing with remaining videos...
```

## Non-Recoverable Errors (v1.5.1)

Some errors cannot be fixed by retrying. The system detects and skips retry for:

### Content Policy Violations

```typescript
static isNonRecoverableError(error: Error): boolean {
  const msg = error.message.toLowerCase();

  // Content blocked by moderation
  if (msg.includes('content_policy_violation') ||
      msg.includes('content could not be processed')) {
    return true;
  }

  // Authentication errors
  if (msg.includes('unauthorized') ||
      msg.includes('invalid api key')) {
    return true;
  }

  // Validation errors
  if (msg.includes('invalid parameter') ||
      msg.includes('validation error')) {
    return true;
  }

  return false;
}
```

**When detected:**
```
❌ Video 5: Content policy violation detected
   This error cannot be recovered by retrying
   Skipping remaining attempts...
⚠️  Continuing with remaining videos...
```

**Benefit:** Saves time by not retrying errors that will always fail.

## Partial Success Support (v1.5.1)

The pipeline continues even if some videos fail:

```typescript
// Each video returns success/failure status
const results = await Promise.all(videoPromises);

// Separate successful and failed
const successful = results.filter(r => r.success);
const failed = results.filter(r => !r.success);

console.log(`✅ Successful: ${successful.length}/${results.length}`);
console.log(`❌ Failed: ${failed.length}/${results.length}`);

if (failed.length > 0) {
  console.log('Problematic prompts:');
  failed.forEach(f => {
    console.log(`  ${f.index + 1}. ${f.prompt?.substring(0, 60)}...`);
    console.log(`     Error: ${f.error}`);
  });
}

// Continue with successful videos
if (successful.length > 0) {
  console.log(`⚠️  Continuing with ${successful.length} successful videos`);
  await mergeVideos(successful.map(r => r.path));
}
```

### Example Output

```
📊 VIDEO GENERATION RESULTS
============================================================
✅ Successful: 7/10 videos
❌ Failed: 3/10 videos

Problematic prompts:
  2. A hustler negotiating a deal in a dark alley...
     Error: content_policy_violation

  5. A mysterious figure in a crowded nightclub...
     Error: Request timeout (after 3 attempts)

  8. An intense confrontation between rival gangs...
     Error: content_policy_violation

⏱️  Total time: 182.5s
============================================================

⚠️  Continuing with 7 successful videos

🎞️ Step 4: Merging videos...
✅ Video merged: output/.../result/merged_video_<timestamp>.mp4
```

## When Retry Doesn't Help

If all 3 attempts fail for a video, possible causes:

### 1. API Issues

**Check:**
- FAL.AI status: https://status.fal.ai/
- Your API quota: https://fal.ai/dashboard

**Solutions:**
- Wait and try again later
- Contact FAL.AI support

### 2. Invalid API Keys

**Check:**
```env
FAL_API_KEY="sk-..."  # Should start with "sk-"
OPENROUTER_API_KEY="sk-..."
GOOGLE_GEMINI_API_KEY="your_key_here"  # Optional but recommended for reliability
```

**Solutions:**
- Verify keys in `.env`
- Regenerate keys if needed

### 3. Insufficient Quota

**Check:**
- FAL.AI dashboard for remaining credits
- OpenRouter activity page

**Solutions:**
- Add credits to account
- Use free mode: `npm run dev -- --free`

### 4. Network Issues

**Check:**
- Internet connection stability
- Firewall/proxy settings

**Solutions:**
- Switch to wired connection
- Disable VPN temporarily
- Check firewall rules

### 5. Content Policy Violations

**Check:**
- Prompt contains sensitive content
- "hustler", "violent", "adult" keywords

**Solutions:**
- Rewrite problematic prompts
- Use alternative descriptions
- Review FAL.AI content guidelines

## Customizing Retry Behavior

### Increase Retry Attempts

Edit `src/workflows/video-generation-workflow.ts`:

```typescript
{
  maxAttempts: 5,  // More attempts (was 3)
  delayMs: 3000,
  backoffMultiplier: 2,
}
```

**Trade-off:** Longer wait on persistent failures.

### Adjust Delays

```typescript
{
  maxAttempts: 3,
  delayMs: 5000,      // Longer initial delay (was 3000)
  backoffMultiplier: 1.5, // Gentler backoff (was 2)
  // Delays: 5s, 7.5s, 11.25s
}
```

**Trade-off:** Slower retry, but may help with rate limits.

### Faster Retry (Not Recommended)

```typescript
{
  maxAttempts: 3,
  delayMs: 1000,      // Shorter delay
  backoffMultiplier: 1.5,
  // Delays: 1s, 1.5s, 2.25s
}
```

**Warning:** May hit rate limits or not give APIs enough time to recover.

## Retry in Other Components

RetryHelper is also used for:

### Text Generation

```typescript
const prompts = await RetryHelper.retry(
  () => this.textGenerator.generateVideoPrompts(storyText, duration),
  {
    maxAttempts: 3,
    delayMs: 2000,
    backoffMultiplier: 2,
  }
);
```

### Audio Generation

```typescript
const audio = await RetryHelper.retry(
  () => this.ttsClient.generateSpeech(text, outputDir),
  {
    maxAttempts: 3,
    delayMs: 3000,
    backoffMultiplier: 2,
  }
);
```

### Image Generation

Already wrapped in video generation retry (generates image → video together).

## Benefits

✅ **Stability** - Temporary errors don't break the pipeline
✅ **Automation** - No manual retry needed
✅ **Transparency** - All attempts logged clearly
✅ **Flexibility** - Easy to configure per use case
✅ **Smart** - Skips non-recoverable errors
✅ **Resilient** - Continues with successful videos

## Advanced Usage

### Custom Retry Logic

```typescript
import { RetryHelper } from './utils/retry-helper';

// Simple retry
const result = await RetryHelper.retry(
  () => myApiCall(),
  { maxAttempts: 3 }
);

// With custom error handling
const result = await RetryHelper.retry(
  async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  {
    maxAttempts: 5,
    delayMs: 2000,
    backoffMultiplier: 2,
    onRetry: (attempt, error) => {
      logger.warn(`Retry ${attempt}: ${error.message}`);
    }
  }
);

// With non-recoverable error detection
const result = await RetryHelper.retry(
  () => riskyOperation(),
  {
    maxAttempts: 3,
    delayMs: 3000,
    backoffMultiplier: 2,
    shouldRetry: (error) => {
      // Custom logic to determine if retry is worthwhile
      if (error.message.includes('permanent_failure')) {
        return false; // Don't retry
      }
      return true; // Retry
    }
  }
);
```

### Retry Statistics

Track retry metrics:

```typescript
let totalRetries = 0;
let successfulRetries = 0;

await RetryHelper.retry(
  () => operation(),
  {
    maxAttempts: 3,
    onRetry: (attempt, error) => {
      totalRetries++;
      if (attempt === 3) successfulRetries++; // Last attempt
    }
  }
);

console.log(`Total retries: ${totalRetries}`);
console.log(`Success rate: ${(successfulRetries / totalRetries * 100).toFixed(1)}%`);
```

## Best Practices

1. **Always use retry for network operations**
2. **Set reasonable maxAttempts** (3-5 is good)
3. **Use exponential backoff** (backoffMultiplier: 2)
4. **Log retry attempts** for debugging
5. **Detect non-recoverable errors** early
6. **Continue on partial success** when possible
7. **Monitor retry rates** to catch systemic issues

## Troubleshooting

### Too Many Retries

**Symptom:** Videos taking very long due to constant retries

**Causes:**
- Systemic API issues
- Invalid configuration
- Network problems

**Solutions:**
1. Check API status pages
2. Verify `.env` configuration
3. Test internet connection
4. Reduce maxAttempts temporarily

### No Retries Happening

**Symptom:** Errors fail immediately without retry

**Causes:**
- Non-recoverable error detected
- RetryHelper not being used
- Exception thrown outside retry block

**Solutions:**
1. Check error type (content policy?)
2. Verify retry wrapper is present
3. Review error logs for "non-recoverable"

### Infinite Retry Loop

**Symptom:** Same video retrying endlessly

**Cause:** Bug in retry logic (should never happen)

**Solutions:**
1. Check maxAttempts is set correctly
2. Report bug with logs
3. Restart application

## Next Steps

- [Quick Start](QUICK_START.md) - Generate your first video
- [Performance Guide](PERFORMANCE.md) - Optimize generation speed
- [Environment Guide](ENV_GUIDE.md) - Configure API settings
