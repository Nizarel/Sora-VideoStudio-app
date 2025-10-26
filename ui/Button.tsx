import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export type ButtonVariant = "default" | "secondary" | "ghost";

export type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: ButtonVariant;
};

// Maps variant prop to brand button classes defined in globals.css
const variantClass = (variant: ButtonVariant): string => {
  switch (variant) {
    case "ghost":
      return "btn-ghost";
    case "secondary":
      return "btn-secondary";
    case "default":
    default:
      return "btn-primary";
  }
};

const Button = ({ children, className = "", variant = "default", ...rest }: ButtonProps) => (
  <button {...rest} className={`btn ${variantClass(variant)} ${className}`}>
    {children}
  </button>
);

export default Button;
