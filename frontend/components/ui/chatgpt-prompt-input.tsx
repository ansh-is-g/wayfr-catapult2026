"use client"

import * as React from "react"
import { Bot, SendHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type PromptBoxProps = {
  className?: string
  value: string
  onValueChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  persona: string
  personas: { value: string; label: string }[]
  onPersonaChange: (value: string) => void
}

export function PromptBox({
  className,
  value,
  onValueChange,
  onSubmit,
  placeholder = "Message...",
  persona,
  personas,
  onPersonaChange,
}: PromptBoxProps) {
  const hasValue = value.trim().length > 0
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [value])

  return (
    <div
      className={cn(
        "rounded-[28px] border border-border/50 bg-background/88 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-colors dark:bg-background/78 dark:shadow-[0_24px_80px_rgba(0,0,0,0.22)]",
        className
      )}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-12 w-full resize-none border-0 bg-transparent p-3 text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />

      <div className="flex items-center gap-2 p-1 pt-0">
        <Select
          value={persona}
          onValueChange={(value) => {
            if (value) onPersonaChange(value)
          }}
        >
          <SelectTrigger
            className="h-8 rounded-full border-0 bg-transparent px-2 text-sm font-normal text-foreground shadow-none hover:bg-accent dark:hover:bg-[#515151]"
            aria-label="Choose persona"
          >
            <Bot className="h-4 w-4" />
            <span className="pr-0.5">Persona</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align="start"
            side="top"
            className="w-56 rounded-2xl bg-popover p-2 dark:bg-[#303030]"
          >
            {personas.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button
            type="button"
            size="icon"
            className="size-8 rounded-full bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80 disabled:bg-black/40 dark:disabled:bg-[#515151]"
            disabled={!hasValue}
            onClick={onSubmit}
          >
            <SendHorizontal className="h-4 w-4" />
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default PromptBox
