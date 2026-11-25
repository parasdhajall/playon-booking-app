// Audio effects helper for casino-grade interaction feel
// Safely plays sounds without breaking when audio context is blocked by browser

export function playSound(path: string, volume: number = 0.5): void {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio(path);
    audio.volume = Math.max(0, Math.min(1, volume));
    const p = audio.play();
    if (p !== undefined) {
      p.catch(() => {
        // Silently catch autoplay/focus restrictions
      });
    }
  } catch {
    // Ignore audio initialization errors
  }
}

// Tap click sound for numbers, pannas, and navigation buttons
export const playTapSound = () => playSound("/app-assets/audio/spinwheel/tap_click.mp3", 0.35);

// Realistic chip toss/clack sound for chip amounts
export const playChipSound = () => playSound("/app-assets/audio/spinwheel/tap_chips.mp3", 0.45);

// Coin spill / jackpot sound for bet confirmations and wallet deposit success
export const playCoinSpillSound = () => playSound("/app-assets/audio/spinwheel/coinspill.mp3", 0.55);
