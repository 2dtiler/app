import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-200 ease-out disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/92",
        destructive:
          "border-destructive bg-transparent text-destructive hover:bg-destructive/10",
        outline:
          "border-border-visible bg-transparent text-foreground hover:border-foreground hover:bg-secondary",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:border-border-visible hover:bg-accent",
        ghost:
          "text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
        link: "border-transparent px-0 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2 has-[>svg]:px-4",
        xs: "h-7 gap-1 rounded-md px-2.5 text-[10px] has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 px-4 has-[>svg]:px-3",
        lg: "h-12 px-6 has-[>svg]:px-5",
        icon: "size-10 rounded-lg",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
