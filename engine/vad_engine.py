import numpy as np
import time
from typing import Optional, Tuple
from config import config
from engine.audio_dsp import AudioDSP

class VADEngine:
    """
    Real-time Voice Activity Detection (VAD) Engine.
    Uses an acoustic feature scoring pipeline (Energy + Spectral flux + Zero Crossing Rate)
    designed to detect speech onset in <30ms with high noise immunity.
    """
    
    def __init__(self, sample_rate: int = 16000, speech_threshold: float = None):
        self.sample_rate = sample_rate
        self.threshold = config.VAD_SPEECH_THRESHOLD if speech_threshold is None else speech_threshold
        self.noise_floor_rms = 0.01  # Adaptive background noise estimate
        self.speech_frame_count = 0
        self.silence_frame_count = 0
        self.is_speech_active = False
        
    def process_frame(self, audio_bytes: bytes) -> Tuple[bool, float, float]:
        """
        Processes a raw PCM frame (e.g., 30ms / 480 samples).
        Returns:
            is_speech (bool): True if speech is detected.
            speech_prob (float): Normalized speech confidence score (0.0 to 1.0).
            latency_ms (float): Processing latency for this frame.
        """
        t0 = time.perf_counter()
        
        if len(audio_bytes) % 2:
            return False, 0.0, (time.perf_counter() - t0) * 1000.0
        try:
            float_arr = AudioDSP.bytes_to_float32(audio_bytes)
        except (ValueError, TypeError):
            return False, 0.0, (time.perf_counter() - t0) * 1000.0
        if len(float_arr) == 0:
            return False, 0.0, 0.0
            
        rms = AudioDSP.calculate_rms(float_arr)
        
        # Adaptive noise floor tracking during silence
        if not self.is_speech_active and rms < self.noise_floor_rms * 2.0:
            self.noise_floor_rms = 0.95 * self.noise_floor_rms + 0.05 * rms
            
        # Zero Crossing Rate (ZCR) to differentiate high-frequency hiss/noise from voiced speech
        zero_crossings = np.count_nonzero(np.diff(np.signbit(float_arr))) / max(1, len(float_arr) - 1)
        
        # Spectral energy ratio in human voice band (approx 300Hz - 3400Hz)
        # Using fast FFT
        fft_vals = np.abs(np.fft.rfft(float_arr))
        freqs = np.fft.rfftfreq(len(float_arr), 1.0 / self.sample_rate)
        
        voice_band = (freqs >= 300) & (freqs <= 3400)
        total_energy = np.sum(fft_vals ** 2) + 1e-9
        voice_band_energy = np.sum(fft_vals[voice_band] ** 2)
        voice_ratio = voice_band_energy / total_energy
        
        # Combined Speech Confidence Score
        snr_factor = np.clip((rms - self.noise_floor_rms) / (self.noise_floor_rms + 1e-5), 0.0, 5.0) / 5.0
        zcr_penalty = 1.0 if (0.02 <= zero_crossings <= 0.35) else 0.4
        
        speech_prob = float(0.5 * voice_ratio + 0.35 * snr_factor + 0.15 * zcr_penalty)
        speech_prob = np.clip(speech_prob, 0.0, 1.0)
        
        # Absolute minimal RMS floor for voiced speech (rejects low-level room hiss / background fan)
        if rms < 0.008:
            speech_prob = 0.0

        is_speech = speech_prob >= self.threshold
        
        # Debounce state transitions (prevent jitter)
        if is_speech:
            self.speech_frame_count += 1
            self.silence_frame_count = 0
            if self.speech_frame_count >= 2:  # 2 consecutive frames = confirmed onset
                self.is_speech_active = True
        else:
            self.silence_frame_count += 1
            self.speech_frame_count = 0
            if self.silence_frame_count >= 5: # 5 frames silence = speech ended
                self.is_speech_active = False
                
        latency_ms = (time.perf_counter() - t0) * 1000.0
        return self.is_speech_active, speech_prob, latency_ms

    def reset(self):
        """Resets the internal tracking state."""
        self.speech_frame_count = 0
        self.silence_frame_count = 0
        self.is_speech_active = False
        self.noise_floor_rms = 0.01
