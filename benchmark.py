"""Run small synthetic diagnostics; these do not measure production accuracy."""

import sys
import time

import numpy as np

from engine.audio_dsp import AudioDSP
from engine.intent_classifier import IntentClassifier, IntentType
from engine.state_manager import DialogueStateManager
from engine.vad_engine import VADEngine


def run_diagnostics() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

    print("=" * 70)
    print("EchoFlow synthetic diagnostics")
    print("These examples are not real-world accuracy or latency benchmarks.")
    print("=" * 70)

    classifier = IntentClassifier()
    examples = [
        ("Wait, stop right there", IntentType.HARD_INTERRUPT),
        ("No, change the date to Friday", IntentType.HARD_INTERRUPT),
        ("uh-huh", IntentType.BACKCHANNEL),
        ("okay got it", IntentType.BACKCHANNEL),
        ("sure, continue", IntentType.BACKCHANNEL),
        ("yeah, change the time", IntentType.HARD_INTERRUPT),
        ("", IntentType.TRANSIENT_NOISE),
    ]
    print("\nIntent heuristic examples:")
    for transcript, expected in examples:
        result = classifier.classify_text(transcript)
        label = "MATCH" if result["intent"] == expected else "REVIEW"
        print(f"[{label}] {transcript!r:36} -> {result['intent']} ({result['latency_ms']:.3f} ms locally)")

    print("\nApproximate interruption history:")
    manager = DialogueStateManager(session_id="diagnostic")
    reply = "Here are three options. First is a morning flight at nine AM, second is an afternoon flight at two PM."
    manager.start_assistant_turn(reply)
    manager.mark_playback_started()
    rollback = manager.rollback_on_interrupt(interrupt_elapsed_ms=1800)
    print(f"Estimated words played: {rollback['words_spoken']} / {rollback['total_words']}")
    print(f"Estimated context note: {rollback['truncated_text']}")
    print("This estimate uses a nominal speaking rate, not TTS word alignment.")

    print("\nSynthetic PCM/VAD/DSP sample:")
    sample_rate = 16000
    time_axis = np.arange(sample_rate * 30 // 1000, dtype=np.float32) / sample_rate
    pcm = (np.sin(2 * np.pi * 440 * time_axis) * 12000).astype(np.int16).tobytes()
    vad = VADEngine(sample_rate=sample_rate)
    vad.process_frame(pcm)  # The heuristic requires consecutive frames to confirm onset.
    speech, score, vad_ms = vad.process_frame(pcm)
    AudioDSP.apply_gain_ducking(pcm, gain_ratio=0.15)  # Warm up NumPy before timing.
    dsp_started = time.perf_counter()
    for _ in range(100):
        ducked = AudioDSP.apply_gain_ducking(pcm, gain_ratio=0.15)
    dsp_mean_ms = (time.perf_counter() - dsp_started) * 10.0
    original_rms = AudioDSP.calculate_rms(AudioDSP.bytes_to_float32(pcm))
    ducked_rms = AudioDSP.calculate_rms(AudioDSP.bytes_to_float32(ducked))
    suppression_db = 20 * np.log10(max(ducked_rms, 1e-9) / max(original_rms, 1e-9))
    print(f"Frame length: {len(pcm)} bytes ({sample_rate} Hz mono PCM16, 30 ms)")
    print(f"Heuristic VAD: active={speech}, score={score:.3f}, processing={vad_ms:.3f} ms")
    print(f"Gain operation mean over 100 frames: {dsp_mean_ms:.3f} ms")
    print(f"Synthetic gain change: {suppression_db:.1f} dB")

    print("\nDiagnostic run complete. Repeat with target hardware, browser, and room audio for meaningful evaluation.")


if __name__ == "__main__":
    run_diagnostics()
