let ctx: AudioContext | null = null;

type AssetOptions = {
  repeats?: number;
  gapMs?: number;
};

function playAsset(path: string, fallback: () => void, options: AssetOptions = {}) {
  try {
    const audio = new Audio(`${import.meta.env.BASE_URL}sounds/${path}`);
    audio.volume = 1;
    audio.preload = "auto";
    let remaining = Math.max(1, Math.floor(options.repeats ?? 1));
    let fallbackPlayed = false;

    const playNext = () => {
      audio.currentTime = 0;
      void audio.play().catch(() => {
        if (!fallbackPlayed) {
          fallbackPlayed = true;
          fallback();
        }
      });
    };

    audio.addEventListener("ended", () => {
      remaining -= 1;
      if (remaining > 0) {
        window.setTimeout(playNext, options.gapMs ?? 140);
      }
    });

    playNext();
  } catch {
    fallback();
  }
}

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(
  ac: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = "sine",
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainValue, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

export function playNewAppointment() {
  playAsset("new-appointment.mp3", () => {
    try {
      const ac = getCtx();
      const t = ac.currentTime;
      for (let i = 0; i < 2; i++) {
        const offset = i * 0.72;
        tone(ac, 587.33, t + offset, 0.22, 0.3, "triangle");
        tone(ac, 739.99, t + offset + 0.13, 0.22, 0.3, "triangle");
        tone(ac, 880, t + offset + 0.26, 0.42, 0.36, "square");
      }
    } catch { /* ignore */ }
  }, { repeats: 2, gapMs: 150 });
}

export function playServiceStart() {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    tone(ac, 440, t, 0.15, 0.2);
    tone(ac, 550, t + 0.12, 0.15, 0.2);
    tone(ac, 660, t + 0.24, 0.25, 0.35, "triangle");
  } catch { /* ignore */ }
}

export function playServiceEnd() {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    tone(ac, 660, t, 0.2, 0.3, "triangle");
    tone(ac, 550, t + 0.18, 0.2, 0.25);
    tone(ac, 440, t + 0.36, 0.35, 0.2);
    tone(ac, 330, t + 0.54, 0.4, 0.15);
  } catch { /* ignore */ }
}

export function playAlert15() {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    for (let cycle = 0; cycle < 2; cycle++) {
      const offset = cycle * 0.95;
      for (let i = 0; i < 3; i++) {
        tone(ac, 880, t + offset + i * 0.24, 0.18, 0.34, "square");
      }
    }
  } catch { /* ignore */ }
}

export function playRescheduled() {
  playAsset("appointment-changed.mp3", () => {
    try {
      const ac = getCtx();
      const t = ac.currentTime;
      for (let i = 0; i < 2; i++) {
        const offset = i * 0.65;
        tone(ac, 880, t + offset, 0.2, 0.3, "triangle");
        tone(ac, 783.99, t + offset + 0.12, 0.2, 0.3, "triangle");
        tone(ac, 659.25, t + offset + 0.24, 0.35, 0.34, "triangle");
      }
    } catch { /* ignore */ }
  }, { repeats: 2, gapMs: 150 });
}

export function playPixPending() {
  playAsset("pix-pending.mp3", () => {
    try {
      const ac = getCtx();
      const t = ac.currentTime;
      for (let i = 0; i < 2; i++) {
        const offset = i * 1.05;
        tone(ac, 392, t + offset, 0.25, 0.32, "square");
        tone(ac, 523.25, t + offset + 0.22, 0.4, 0.38, "square");
        tone(ac, 392, t + offset + 0.72, 0.25, 0.32, "square");
      }
    } catch { /* ignore */ }
  }, { repeats: 2, gapMs: 180 });
}
