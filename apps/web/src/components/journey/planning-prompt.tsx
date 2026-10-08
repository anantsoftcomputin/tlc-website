"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkles } from "lucide-react";
export function PlanningPrompt() {
  const [text, setText] = useState("");
  const router = useRouter();
  function begin(value: string) {
    try {
      sessionStorage.setItem("tlc-planner-prompt", value);
    } catch {}
    router.push("/plan-my-trip");
  }
  return (
    <div className="planning-prompt">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          begin(text);
        }}
      >
        <label className="sr-only" htmlFor="home-trip-idea">
          Describe your holiday
        </label>
        <textarea
          id="home-trip-idea"
          maxLength={2000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="A week in Bali, two adults, a little adventure and plenty of time by the sea…"
        />
        <div>
          <span>
            <Sparkles size={15} /> Plan with Tara, your TLC AI assistant
          </span>
          <button type="submit">
            Start my trip <ArrowUp size={17} />
          </button>
        </div>
      </form>
      <div className="planning-starters">
        {[
          "Help me choose a destination",
          "A relaxed family trip to Dubai for 6 days",
          "A romantic week in Bali",
        ].map((prompt) => (
          <button key={prompt} onClick={() => begin(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
