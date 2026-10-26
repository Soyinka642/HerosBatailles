// Le lecteur : lecture, pause, tour suivant, vitesse, recommencer. Il avance dans la suite des
// temps d'animation et confie chacun à un « plateau » (la scène et le journal). Sans Phaser.

import type { Beat } from './timeline';

/** Ce qui joue un temps : l'animer (ou l'appliquer d'un coup), et revenir au début. */
export interface Stage {
  /** Joue un temps ; animé, à la vitesse donnée, ou d'un coup. */
  play(beat: Beat, animated: boolean, speed: number): Promise<void>;
  reset(): void;
}

export const SPEEDS = [0.5, 1, 2, 4] as const;

export class Player {
  private index = 0;
  private playing = false;
  private running?: Promise<void>;
  private speedIndex = 1;
  /** Appelé à chaque changement (temps joué, lecture, pause, vitesse). */
  onChange: () => void = () => {};

  constructor(
    private readonly beats: readonly Beat[],
    private readonly stage: Stage,
  ) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  get isDone(): boolean {
    return this.index >= this.beats.length;
  }

  get speed(): number {
    return SPEEDS[this.speedIndex]!;
  }

  /** Le tour du dernier temps joué (0 avant le premier). */
  get turn(): number {
    return this.index === 0 ? 0 : this.beats[this.index - 1]!.turn;
  }

  play(): void {
    if (this.isDone) return;
    this.playing = true;
    this.onChange();
    this.running ??= this.run();
  }

  pause(): void {
    this.playing = false;
    this.onChange();
  }

  faster(): void {
    this.speedIndex = Math.min(SPEEDS.length - 1, this.speedIndex + 1);
    this.onChange();
  }

  slower(): void {
    this.speedIndex = Math.max(0, this.speedIndex - 1);
    this.onChange();
  }

  /** Met en pause, termine le temps en cours, puis joue d'un coup jusqu'à la fin du tour. */
  async nextTurn(): Promise<void> {
    this.pause();
    await this.running;
    while (!this.isDone) {
      const beat = this.beats[this.index++]!;
      await this.stage.play(beat, false, this.speed);
      if (beat.kind === 'turnEnd' || beat.kind === 'end') break;
    }
    // La fin de bataille suit immédiatement la fin du dernier tour.
    if (this.beats[this.index]?.kind === 'end') await this.stage.play(this.beats[this.index++]!, false, this.speed);
    this.onChange();
  }

  async restart(): Promise<void> {
    this.pause();
    await this.running;
    this.index = 0;
    this.stage.reset();
    this.onChange();
  }

  private async run(): Promise<void> {
    while (this.playing && !this.isDone) {
      await this.stage.play(this.beats[this.index++]!, true, this.speed);
      this.onChange();
    }
    if (this.isDone) this.playing = false;
    this.running = undefined;
    this.onChange();
  }
}
