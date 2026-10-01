"""Small transcript heuristic for deciding whether speech should interrupt playback."""

import re
import time
from typing import Any, Dict


class IntentType:
    HARD_INTERRUPT = "HARD_INTERRUPT"
    BACKCHANNEL = "BACKCHANNEL"
    TRANSIENT_NOISE = "TRANSIENT_NOISE"
    INCOMPLETE_PHRASE = "INCOMPLETE_PHRASE"


class IntentClassifier:
    """Classify finalized transcript text; this is a heuristic, not an ML model."""

    BACKCHANNELS = {
        "uh huh", "uh-huh", "mhm", "mm-hmm", "mm hmm", "yeah", "yep", "yup",
        "ok", "okay", "okay got it", "right", "got it", "sure", "cool", "i see", "ah", "oh",
        "hmm", "yes", "understood", "alright", "all right", "sure continue",
        "okay continue", "yeah go on", "uh huh go on", "mhm go on",
    }
    INTERRUPT_PATTERN = re.compile(
        r"\b(wait|stop|hold on|cancel|no|nope|actually|change|instead|shut up|quiet|"
        r"pause|listen|wrong|not that|option|first|second|third|tomorrow|yesterday|"
        r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|what about|how about|"
        r"can you|i want|give me|tell me|who|where|when|why|how)\b",
        re.IGNORECASE,
    )

    def classify_text(self, transcript: str) -> Dict[str, Any]:
        started = time.perf_counter()
        clean_text = " ".join((transcript or "").strip().lower().split())
        backchannel_text = " ".join(re.sub(r"[.,!?;:]", " ", clean_text).split())

        if not clean_text:
            intent, confidence, matched = IntentType.TRANSIENT_NOISE, 1.0, ""
        elif backchannel_text in self.BACKCHANNELS:
            intent, confidence, matched = IntentType.BACKCHANNEL, 0.95, backchannel_text
        else:
            match = self.INTERRUPT_PATTERN.search(clean_text)
            # During assistant playback, any finalized non-backchannel utterance is
            # treated as an interruption so normal requests are not silently dropped.
            intent = IntentType.HARD_INTERRUPT
            confidence = 0.95 if match else 0.75
            matched = match.group(0) if match else clean_text

        return {
            "intent": intent,
            "confidence": confidence,
            "matched_text": matched,
            "latency_ms": (time.perf_counter() - started) * 1000.0,
        }
