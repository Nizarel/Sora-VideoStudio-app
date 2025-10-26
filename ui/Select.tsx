import type { SelectHTMLAttributes } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const Select = ({ className = "", ...props }: SelectProps) => (
  <select
    {...props}
    className={`w-full rounded-lg border-2 border-border bg-card px-4 py-3 text-foreground outline-none transition-all focus:border-green-700 focus:ring-4 focus:ring-green-700/15 ${className}`}
  />
);

export default Select;
