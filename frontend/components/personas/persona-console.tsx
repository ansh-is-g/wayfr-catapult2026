"use client"

import { useState } from "react"

import { PromptBox } from "@/components/ui/chatgpt-prompt-input"
import { cn } from "@/lib/utils"

type ChatMessage = {
  role: "assistant" | "user"
  text: string
}

const PERSONAS = [
  { value: "reader", label: "Reader" },
  { value: "caregiver", label: "Caregiver" },
  { value: "guide", label: "Guide" },
]

function buildAssistantReply(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    return "Tell me the persona and the annotation goal."
  }

  return `Mock ${text.includes("persona") ? "persona" : "agent"} response: I would derive a persona-specific annotation plan from "${trimmed}" and generate the scene output after this step.`
}

function BlinkingEyes() {
  return (
    <div className="flex items-center justify-center gap-6 sm:gap-8" aria-hidden="true">
      <span className="persona-eye persona-eye-left">
        <span className="persona-eye-core" />
      </span>
      <span className="persona-eye persona-eye-right">
        <span className="persona-eye-core" />
      </span>
      <style jsx>{`
        .persona-eye {
          display: block;
          width: 112px;
          height: 78px;
        }

        .persona-eye-left {
          transform: rotate(-9deg);
        }

        .persona-eye-right {
          transform: rotate(9deg);
        }

        .persona-eye-core {
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 24px;
          background:
            radial-gradient(circle at 50% 18%, rgba(255, 236, 204, 0.46), transparent 32%),
            radial-gradient(circle at 50% 72%, rgba(164, 82, 16, 0.18), transparent 50%),
            linear-gradient(180deg, rgba(255, 190, 76, 1), rgba(228, 138, 32, 0.95));
          box-shadow:
            0 0 32px rgba(245, 166, 35, 0.34),
            0 0 88px rgba(245, 166, 35, 0.18);
          transform-origin: center;
          animation: personaBlink 4.2s ease-in-out infinite;
          will-change: transform, opacity;
        }

        .persona-eye-right .persona-eye-core {
          animation-delay: 0.14s;
        }

        @keyframes personaBlink {
          0%,
          86%,
          100% {
            opacity: 1;
            transform: scaleY(1);
          }

          89%,
          92% {
            opacity: 0.92;
            transform: scaleY(0.16);
          }
        }

        @media (max-width: 640px) {
          .persona-eye {
            width: 86px;
            height: 62px;
          }

          .persona-eye-core {
            border-radius: 20px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .persona-eye-core {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}

export function PersonaConsole() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [persona, setPersona] = useState(PERSONAS[0].value)
  const hasMessages = messages.length > 0

  const submitMessage = (nextText?: string) => {
    const text = (nextText ?? draft).trim()
    if (!text) return

    setMessages((current) => [
      ...current,
      { role: "user", text },
      { role: "assistant", text: buildAssistantReply(`${PERSONAS.find((item) => item.value === persona)?.label ?? "Persona"}: ${text}`) },
    ])
    setDraft("")
  }

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className={cn("w-full", hasMessages ? "flex-1" : "flex flex-1 items-center")}>
        <div className="mx-auto w-full max-w-3xl">
          {hasMessages ? (
            <div className="mb-8 max-h-[34vh] space-y-3 overflow-y-auto">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    "max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-6",
                    message.role === "assistant"
                      ? "bg-muted/45 text-foreground"
                      : "ml-auto bg-mango/10 text-foreground"
                  )}
                >
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className={cn("w-full", hasMessages ? "" : "relative")}>
            <div
              className={cn(
                "flex flex-col items-center",
                hasMessages ? "mb-8" : "pointer-events-none absolute bottom-full left-1/2 mb-10 -translate-x-1/2"
              )}
            >
              {!hasMessages ? (
                <p className="mb-6 text-center text-3xl tracking-tight text-foreground sm:text-4xl">
                  Choose a persona
                </p>
              ) : null}
              <BlinkingEyes />
            </div>

            <PromptBox
              value={draft}
              onValueChange={setDraft}
              onSubmit={() => submitMessage()}
              placeholder="Describe the persona and annotation intent..."
              persona={persona}
              personas={PERSONAS}
              onPersonaChange={setPersona}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

export default PersonaConsole
