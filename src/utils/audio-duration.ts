import ffmpeg from 'fluent-ffmpeg';

/**
 * Get the actual duration of an audio file using ffprobe.
 * Returns duration in seconds.
 */
export function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to get audio duration: ${err.message}`));
        return;
      }

      const duration = metadata.format.duration;
      if (duration === undefined || duration === null) {
        reject(new Error('Could not determine audio duration from metadata'));
        return;
      }

      console.log(`⏱️  Actual audio duration: ${duration.toFixed(1)}s`);
      resolve(duration);
    });
  });
}
