// Card container with a hairline border and consistent padding.

import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export default function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={
        "rounded-card border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 " +
        className
      }
      {...rest}
    >
      {children}
    </div>
  );
}
