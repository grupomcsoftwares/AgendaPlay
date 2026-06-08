let ctx: AudioContext | null = null;

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
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    tone(ac, 523.25, t, 0.25, 0.25);       // C5
    tone(ac, 659.25, t + 0.15, 0.25, 0.25); // E5
    tone(ac, 783.99, t + 0.30, 0.40, 0.30); // G5
  } catch { /* ignore */ }
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
    for (let i = 0; i < 3; i++) {
      tone(ac, 880, t + i * 0.35, 0.2, 0.3, "square");
    }
  } catch { /* ignore */ }
}
