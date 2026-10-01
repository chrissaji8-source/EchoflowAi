import numpy as np

class AudioDSP:
    """
    Audio DSP utility for real-time PCM frame transformations,
    cosine ducking/fade envelopes, and energy profiling.
    """
    
    @staticmethod
    def bytes_to_float32(audio_bytes: bytes) -> np.ndarray:
        """Converts raw 16-bit PCM bytes to normalized float32 numpy array (-1.0 to 1.0)."""
        if len(audio_bytes) % 2:
            raise ValueError("PCM16 input must contain an even number of bytes.")
        int16_arr = np.frombuffer(audio_bytes, dtype="<i2")
        return int16_arr.astype(np.float32) / 32768.0

    @staticmethod
    def float32_to_bytes(float32_arr: np.ndarray) -> bytes:
        """Converts normalized float32 numpy array to 16-bit PCM bytes."""
        clipped = np.clip(float32_arr, -1.0, 1.0)
        int16_arr = np.rint(clipped * 32767.0).astype("<i2")
        return int16_arr.tobytes()

    @staticmethod
    def calculate_rms(float32_arr: np.ndarray) -> float:
        """Computes Root Mean Square (RMS) energy of an audio frame."""
        if len(float32_arr) == 0:
            return 0.0
        return float(np.sqrt(np.mean(float32_arr ** 2)))

    @staticmethod
    def calculate_db(float32_arr: np.ndarray) -> float:
        """Computes Decibels (dBFS) relative to full scale."""
        rms = AudioDSP.calculate_rms(float32_arr)
        if rms <= 1e-7:
            return -96.0
        return float(20.0 * np.log10(rms))

    @staticmethod
    def apply_cosine_fade_out(audio_bytes: bytes, fade_samples: int = 480) -> bytes:
        """
        Applies a smooth raised-cosine fade-out over the requested PCM sample count.
        """
        if len(audio_bytes) % 2:
            raise ValueError("PCM16 input must contain an even number of bytes.")
        int16_arr = np.frombuffer(audio_bytes, dtype="<i2").astype(np.float32)
        total_len = len(int16_arr)
        if total_len == 0:
            return b""
            
        fade_len = min(max(0, int(fade_samples)), total_len)
        if fade_len == 0:
            return int16_arr.astype("<i2").tobytes()
        envelope = 0.5 * (1.0 + np.cos(np.linspace(0, np.pi, fade_len)))
        
        # Apply fade to the end of the buffer
        int16_arr[-fade_len:] *= envelope
        return np.clip(np.rint(int16_arr), -32768, 32767).astype("<i2").tobytes()

    @staticmethod
    def apply_gain_ducking(audio_bytes: bytes, gain_ratio: float = 0.15) -> bytes:
        """Applies dynamic volume ducking (gain reduction) to a frame."""
        if len(audio_bytes) % 2:
            raise ValueError("PCM16 input must contain an even number of bytes.")
        int16_arr = np.frombuffer(audio_bytes, dtype="<i2").astype(np.float32)
        gain = float(np.clip(gain_ratio, 0.0, 1.0))
        ducked = np.clip(np.rint(int16_arr * gain), -32768, 32767)
        return ducked.astype("<i2").tobytes()
