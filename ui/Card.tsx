import type { PropsWithChildren } from "react";

export type CardProps = PropsWithChildren<{ className?: string }>;

// Wraps children with brand card styling (see globals.css .card)
const Card = ({ children, className = "" }: CardProps) => (
  <div className={`card ${className}`}>
    {children}
  </div>
);

export default Card;
