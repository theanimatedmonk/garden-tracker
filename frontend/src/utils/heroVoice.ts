/** Announce a surfaced (hero) bird via the browser Speech Synthesis API. */
export function speakHeroFound(species: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }

  const name = species.trim();
  if (!name) {
    return;
  }

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(`Bird found! It's a ${name}.`);
  utter.lang = "en-IN";

  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang.startsWith("en-IN")) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      null
    );
  };

  const voice = pickVoice();
  if (voice) {
    utter.voice = voice;
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      const v = pickVoice();
      if (v) {
        utter.voice = v;
      }
      window.speechSynthesis.onvoiceschanged = null;
    };
  }

  window.speechSynthesis.speak(utter);
}
