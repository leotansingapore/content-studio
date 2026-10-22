// Dictate into a box (Web Speech API, "en-SG", continuous, interim text while you speak). Moved out of Idea Dump so the
// interview can use it; the button hides where `supported` is false.

import { useEffect, useRef, useState } from "react";
import { speechRecognition, type SpeechRecognitionLike } from "@/lib/dictation";

export function useDictation(onFinal: (chunk: string) => void) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;
  const [supported] = useState(() => speechRecognition(globalThis.window) !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const stop = () => recognitionRef.current?.stop();

  const toggle = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = speechRecognition(globalThis.window);
    if (!Recognition) return;
    const rec = new Recognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-SG";
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText.trim()) finalRef.current(finalText);
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access is blocked. Allow it in your browser settings to dictate.");
      } else if (e.error === "no-speech") {
        setError("Didn't catch that. Try again a little closer to the mic.");
      } else if (e.error !== "aborted") {
        setError("Dictation stopped. Try again.");
      }
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
      setError("");
    } catch {
      setError("Couldn't start dictation. Try again.");
    }
  };

  return { supported, listening, interim, error, toggle, stop };
}
