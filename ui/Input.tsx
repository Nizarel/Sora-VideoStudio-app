import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = ({ className = "", ...props }: InputProps) => (
  <input
    {...props}
    className={`w-full rounded-lg border-2 border-border bg-card px-4 py-3 text-foreground outline-none transition-all focus:border-green-700 focus:ring-4 focus:ring-green-700/15 ${className}`}
  />
);

export default Input;
