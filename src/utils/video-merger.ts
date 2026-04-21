import ffmpeg from 'fluent-ffmpeg';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface VideoMergeResult {
  outputPath: string;
  duration: number;
}

export class VideoMerger {
  async mergeVideos(videoPaths: string[], outputDir: string = './output'): Promise<VideoMergeResult> {
    console.log('\n' + '='.repeat(60));
    console.log('🎬  СКЛЕЙКА ВИДЕО (FFmpeg)');
    console.log('='.repeat(60));
    console.log('📥 Количество видео:', videoPaths.length);

    if (videoPaths.length === 0) {
      throw new Error('No videos to merge');
    }

    // Создаём директорию для вывода, если её нет
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `merged_video_${Date.now()}.mp4`);

    // Создаём временный файл со списком видео для FFmpeg
    const listFilePath = path.join(outputDir, `filelist_${Date.now()}.txt`);
    const fileListContent = videoPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
    fs.writeFileSync(listFilePath, fileListContent);

    console.log('\n📝 Список видео для склейки:');
    videoPaths.forEach((p, i) => {
      console.log(`  ${i + 1}. ${path.basename(p)}`);
    });

    console.log('\n🔄 Запуск FFmpeg...');

    return new Promise((resolve, reject) => {
      let totalDuration = 0;

      ffmpeg()
        .input(listFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-c', 'copy', // Копируем потоки без перекодирования (быстрее)
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('   FFmpeg команда:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`   Прогресс: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', () => {
          // Удаляем временный файл списка
          fs.unlinkSync(listFilePath);

          const stats = fs.statSync(outputPath);
          console.log('\n✅ Видео склеено успешно!');
          console.log('📁 Выходной файл:', outputPath);
          console.log('📊 Размер файла:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
          console.log('='.repeat(60) + '\n');

          // Получаем длительность итогового видео
          ffmpeg.ffprobe(outputPath, (err, metadata) => {
            if (err) {
              console.warn('⚠️  Не удалось получить длительность:', err.message);
              totalDuration = videoPaths.length * 8; // Примерная оценка
            } else {
              totalDuration = metadata.format.duration || 0;
              console.log('⏱️  Общая длительность:', totalDuration.toFixed(1), 'секунд');
            }

            resolve({
              outputPath,
              duration: totalDuration,
            });
          });
        })
        .on('error', (err) => {
          // Удаляем временный файл списка в случае ошибки
          if (fs.existsSync(listFilePath)) {
            fs.unlinkSync(listFilePath);
          }

          console.error('❌ Ошибка FFmpeg:', err.message);
          console.log('='.repeat(60) + '\n');
          reject(err);
        })
        .run();
    });
  }

  async createBannerVideo(imagePath: string, durationSec: number = 4, outputDir: string = './output'): Promise<string> {
    console.log('\n' + '='.repeat(60));
    console.log('🖼️🎬 СОЗДАНИЕ БАННЕРА (FFmpeg)');
    console.log('='.repeat(60));
    console.log('🖼️ Изображение:', path.basename(imagePath));
    console.log('⏱️ Длительность:', durationSec, 'сек');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `banner_${Date.now()}.mp4`);
    console.log('\n🔄 Запуск FFmpeg...');

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(imagePath)
        .loop(1)
        .inputOptions(['-framerate', '24'])
        .outputOptions([
          '-t', durationSec.toString(),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18',
          '-r', '24',
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=768:1364:force_original_aspect_ratio=decrease,pad=768:1364:(ow-iw)/2:(oh-ih)/2:color=black'
        ])
        .output(outputPath)
        .on('start', (commandLine) => console.log('   FFmpeg команда:', commandLine))
        .on('end', () => {
          console.log('\n✅ Баннер создан!');
          console.log('📁 Выходной файл:', outputPath);
          console.log('='.repeat(60) + '\n');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('❌ Ошибка FFmpeg:', err.message);
          console.log('='.repeat(60) + '\n');
          reject(err);
        })
        .run();
    });
  }

  async mergeWithCrossfade(videoPath1: string, videoPath2: string, duration1: number, crossfadeDuration: number = 1, outputDir: string = './output'): Promise<VideoMergeResult> {
    console.log('\n' + '='.repeat(60));
    console.log('🎬✨ СКЛЕЙКА С ПЕРЕХОДОМ (CROSSFADE)');
    console.log('='.repeat(60));
    console.log('📹 Видео 1:', path.basename(videoPath1));
    console.log('📹 Видео 2:', path.basename(videoPath2));
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `merged_fade_${Date.now()}.mp4`);
    // xfade offset in seconds
    const offset = Math.max(0, duration1 - crossfadeDuration);

    console.log('\n🔄 Запуск FFmpeg...');

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath1)
        .input(videoPath2)
        .complexFilter([
          `[0:v][1:v]xfade=transition=fade:duration=${crossfadeDuration}:offset=${offset}[v]`
        ])
        .outputOptions([
          '-map', '[v]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18'
        ])
        .output(outputPath)
        .on('start', (commandLine) => console.log('   FFmpeg команда:', commandLine))
        .on('progress', (progress) => {
          if (progress.percent) {
            process.stdout.write(`\r   Прогресс: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', () => {
          console.log(''); // newline after progress
          // Calculate new duration
          ffmpeg.ffprobe(outputPath, (err, metadata) => {
             const duration = metadata?.format?.duration || (offset + 4); // Fallback
             console.log('\n✅ Видео с переходом создано!');
             console.log('📁 Выходной файл:', outputPath);
             console.log('⏱️  Общая длительность:', duration.toFixed(1), 'секунд');
             console.log('='.repeat(60) + '\n');
             resolve({ outputPath, duration });
          });
        })
        .on('error', (err) => {
          console.error('\n❌ Ошибка FFmpeg:', err.message);
          console.log('='.repeat(60) + '\n');
          reject(err);
        })
        .run();
    });
  }

  async addAudioToVideo(videoPath: string, audioPath: string, outputDir: string = './output'): Promise<string> {
    console.log('\n' + '='.repeat(60));
    console.log('🎵  ДОБАВЛЕНИЕ АУДИО К ВИДЕО (FFmpeg)');
    console.log('='.repeat(60));
    console.log('📹 Видео:', path.basename(videoPath));
    console.log('🔊 Аудио:', path.basename(audioPath));

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `final_video_${Date.now()}.mp4`);

    console.log('\n🔄 Запуск FFmpeg...');

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-map', '0:v', // Explicitly map video from first input
          '-map', '1:a', // Explicitly map audio from second input
          '-c:v', 'copy', // Копируем видео без перекодирования
          '-c:a', 'aac', // Конвертируем аудио в AAC
          '-b:a', '192k', // Битрейт аудио
          // No -shortest: video segments are pre-calculated to match audio duration
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('   FFmpeg команда:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`   Прогресс: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', () => {
          const stats = fs.statSync(outputPath);
          console.log('\n✅ Аудио добавлено успешно!');
          console.log('📁 Выходной файл:', outputPath);
          console.log('📊 Размер файла:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
          console.log('='.repeat(60) + '\n');

          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('❌ Ошибка FFmpeg:', err.message);
          console.log('='.repeat(60) + '\n');
          reject(err);
        })
        .run();
    });
  }

  async burnSubtitles(videoPath: string, subtitlePath: string, outputDir: string = './output'): Promise<string> {
    console.log('\n' + '='.repeat(60));
    console.log('📝  BURNING SUBTITLES INTO VIDEO (FFmpeg + Docker)');
    console.log('='.repeat(60));
    console.log('📹 Video:', path.basename(videoPath));
    console.log('📝 Subtitles:', path.basename(subtitlePath));

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const absVideoPath = path.resolve(videoPath);
    const absSubtitlePath = path.resolve(subtitlePath);
    const absOutputDir = path.resolve(outputDir);
    const outputFileName = `subtitled_video_${Date.now()}.mp4`;
    const absOutputPath = path.join(absOutputDir, outputFileName);

    // Find common parent directory to mount into Docker
    const mountDir = this.findCommonParent(absVideoPath, absSubtitlePath, absOutputDir);

    // Compute paths relative to mountDir for use inside container
    const relVideo = path.relative(mountDir, absVideoPath);
    const relSubtitle = path.relative(mountDir, absSubtitlePath);
    const relOutput = path.relative(mountDir, absOutputPath);

    console.log('\n🐳 Using Docker for subtitle burning (libass support)...');
    console.log(`   Mount: ${mountDir} -> /data`);

    return new Promise((resolve, reject) => {
      // Escape colon in subtitle path for ass filter inside ffmpeg
      const escapedSubPath = `/data/${relSubtitle}`.replace(/:/g, '\\:');

      const args = [
        'run', '--rm',
        '-v', `${mountDir}:/data`,
        'jrottenberg/ffmpeg:6-ubuntu',
        '-i', `/data/${relVideo}`,
        '-y',
        '-vf', `ass='${escapedSubPath}'`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-c:a', 'copy',
        `/data/${relOutput}`,
      ];

      console.log('   Docker command: docker', args.join(' '));

      const proc = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';
      proc.stderr?.on('data', (data: Buffer) => {
        const line = data.toString();
        stderr += line;
        // Print progress lines from ffmpeg
        if (line.includes('frame=') || line.includes('time=')) {
          const timeMatch = line.match(/time=(\S+)/);
          if (timeMatch) {
            process.stdout.write(`\r   Progress: ${timeMatch[1]}`);
          }
        }
      });

      proc.on('close', (code: number | null) => {
        console.log(''); // newline after progress
        if (code === 0 && fs.existsSync(absOutputPath)) {
          const stats = fs.statSync(absOutputPath);
          console.log('\n✅ Subtitles burned successfully!');
          console.log('📁 Output file:', absOutputPath);
          console.log('📊 File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
          console.log('='.repeat(60) + '\n');
          resolve(absOutputPath);
        } else {
          console.error('❌ Docker FFmpeg Error (exit code:', code, ')');
          console.error('   stderr:', stderr.slice(-500));
          console.log('='.repeat(60) + '\n');
          reject(new Error(`Docker ffmpeg failed with exit code ${code}: ${stderr.slice(-300)}`));
        }
      });

      proc.on('error', (err: Error) => {
        console.error('❌ Docker launch failed:', err.message);
        console.log('   Make sure Docker is running.');
        console.log('='.repeat(60) + '\n');
        reject(new Error(`Docker not available: ${err.message}`));
      });
    });
  }

  private findCommonParent(...paths: string[]): string {
    const parts = paths.map(p => path.resolve(p).split(path.sep));
    const minLen = Math.min(...parts.map(p => p.length));
    let common: string[] = [];
    for (let i = 0; i < minLen; i++) {
      if (parts.every(p => p[i] === parts[0][i])) {
        common.push(parts[0][i]);
      } else {
        break;
      }
    }
    return common.join(path.sep) || '/';
  }
}
