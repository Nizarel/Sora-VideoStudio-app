import type { TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = ({ className = "", ...props }: TextareaProps) => (
  <textarea
    {...props}
    className={`w-full rounded-lg border-2 border-border bg-card px-4 py-3 text-foreground outline-none transition-all focus:border-green-700 focus:ring-4 focus:ring-green-700/15 resize-none ${className}`}
  />
);

export default Textarea;
