"""Per-connection conversation history and approximate interruption bookkeeping."""

import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class WordTiming:
    word: str
    start_ms: float
    end_ms: float


class DialogueStateManager:
    """Track dialogue turns and estimate which words played before an interruption."""

    DEFAULT_SYSTEM_PROMPT = (
        "You are EchoFlow, an intelligent, real-time conversational voice assistant. "
        "Lead with a concise, direct, helpful answer in 1 to 3 short spoken sentences (under 40 words). "
        "Reply in the same language as the user's message. "
        "IMPORTANT: The user input is transcribed in real-time from browser speech-to-text. It may contain "
        "occasional phonetic inaccuracies, misheard words, or homophones (e.g., 'low air', 'slow ar', 'for low air' "
        "usually refer to 'EchoFlow AI' or greetings, and words like 'table for to' mean 'table for two'). "
        "Always interpret the user's intended meaning naturally from context. Never pedantically point out or "
        "repeat obvious speech recognition typos; simply answer their intended question smoothly. "
        "When a user interrupts, immediately address the new request without repeating prior words."
    )
    MAX_HISTORY_MESSAGES = 41

    def __init__(self, session_id: str = "default"):
        self.session_id = session_id
        self.history: List[Dict[str, str]] = [
            {"role": "system", "content": self.DEFAULT_SYSTEM_PROMPT}
        ]
        self.current_assistant_text = ""
        self.current_utterance_start_time: Optional[float] = None
        self.word_timings: List[WordTiming] = []
        self.is_assistant_speaking = False

    def start_assistant_turn(self, full_text: str, estimated_wpm: int = 165) -> None:
        self.current_assistant_text = full_text.strip()
        self.current_utterance_start_time = None
        self.is_assistant_speaking = bool(self.current_assistant_text)
        self.word_timings.clear()
        words = self.current_assistant_text.split()
        if not words:
            return

        ms_per_word = 60_000.0 / max(60, estimated_wpm)
        offset = 0.0
        for word in words:
            duration = ms_per_word + (120.0 if any(char in word for char in ".!?,;:") else 0.0)
            self.word_timings.append(WordTiming(word, offset, offset + duration))
            offset += duration

    def mark_playback_started(self) -> None:
        if self.is_assistant_speaking and self.current_utterance_start_time is None:
            self.current_utterance_start_time = time.perf_counter()

    def rollback_on_interrupt(self, interrupt_elapsed_ms: Optional[float] = None) -> Dict[str, Any]:
        if not self.is_assistant_speaking:
            return {"status": "NOOP", "truncated_text": ""}

        if interrupt_elapsed_ms is None:
            if self.current_utterance_start_time is None:
                interrupt_elapsed_ms = 0.0
            else:
                interrupt_elapsed_ms = max(
                    0.0, (time.perf_counter() - self.current_utterance_start_time) * 1000.0
                )

        # Word timing is estimated from a nominal speaking rate. TTS engines vary,
        # so this is explicitly an approximation, not word-level alignment.
        spoken_words = [timing.word for timing in self.word_timings if timing.end_ms <= interrupt_elapsed_ms]
        truncated_text = " ".join(spoken_words)
        note = (
            f"Approximate playback before interruption: {truncated_text}"
            if truncated_text
            else "Interrupted before a complete word was estimated to have played."
        )
        self._append_history({"role": "assistant", "content": note})
        self.is_assistant_speaking = False
        elapsed = max(0.0, float(interrupt_elapsed_ms))
        result = {
            "status": "ROLLED_BACK",
            "elapsed_ms": round(elapsed, 2),
            "words_spoken": len(spoken_words),
            "total_words": len(self.word_timings),
            "truncated_text": truncated_text,
            "history_note": note,
            "original_text": self.current_assistant_text,
            "approximate": True,
        }
        self.current_utterance_start_time = None
        return result

    def complete_assistant_turn(self) -> None:
        if self.is_assistant_speaking:
            self._append_history({"role": "assistant", "content": self.current_assistant_text})
        self.is_assistant_speaking = False
        self.current_utterance_start_time = None

    def add_user_turn(self, user_text: str) -> None:
        clean_text = (user_text or "").strip()
        if clean_text:
            self._append_history({"role": "user", "content": clean_text})

    def _append_history(self, message: Dict[str, str]) -> None:
        self.history.append(message)
        if len(self.history) > self.MAX_HISTORY_MESSAGES:
            self.history = [self.history[0], *self.history[-(self.MAX_HISTORY_MESSAGES - 1):]]

    def get_context_for_llm(self) -> List[Dict[str, str]]:
        return [message.copy() for message in self.history]
