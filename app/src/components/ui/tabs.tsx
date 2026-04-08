"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "rounded-lg p-[3px] group-data-[orientation=horizontal]/tabs:h-9 data-[variant=line]:rounded-none group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "bg-muted",
        editor: "h-8 gap-0 rounded-none border-b border-border bg-transparent p-0 text-foreground",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  scrollable = false,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants> & {
    /** When true, shows left/right arrow buttons on overflow instead of a scrollbar */
    scrollable?: boolean;
  }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const checkOverflow = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !scrollable) return;

    checkOverflow();
    el.addEventListener("scroll", checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);

    // Also observe mutations so new tabs trigger a recheck
    const mo = new MutationObserver(checkOverflow);
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener("scroll", checkOverflow);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollable, checkOverflow]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.6;
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  if (!scrollable) {
    return (
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    );
  }

  return (
    <div
      data-variant={variant}
      className="group/tabs-scroll flex items-center w-full max-w-full min-w-0"
    >
      <button
        type="button"
        aria-label="Scroll tabs left"
        tabIndex={-1}
        className={cn(
          "flex-none flex items-center justify-center h-6 w-5 text-muted-foreground hover:text-foreground transition-opacity group-data-[variant=editor]/tabs-scroll:h-8 group-data-[variant=editor]/tabs-scroll:w-4 group-data-[variant=editor]/tabs-scroll:border-b group-data-[variant=editor]/tabs-scroll:border-border group-data-[variant=editor]/tabs-scroll:bg-transparent",
          canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onMouseDown={() => scroll("left")}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-none min-w-0 flex-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <TabsPrimitive.List
          data-slot="tabs-list"
          data-variant={variant}
          className={cn(
            tabsListVariants({ variant }),
            "w-max flex-nowrap",
            className,
          )}
          {...props}
        />
      </div>
      <button
        type="button"
        aria-label="Scroll tabs right"
        tabIndex={-1}
        className={cn(
          "flex-none flex items-center justify-center h-6 w-5 text-muted-foreground hover:text-foreground transition-opacity group-data-[variant=editor]/tabs-scroll:h-8 group-data-[variant=editor]/tabs-scroll:w-4 group-data-[variant=editor]/tabs-scroll:border-b group-data-[variant=editor]/tabs-scroll:border-border group-data-[variant=editor]/tabs-scroll:bg-transparent",
          canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onMouseDown={() => scroll("right")}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-muted-foreground hover:text-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=editor]/tabs-list:h-full group-data-[variant=editor]/tabs-list:flex-none group-data-[variant=editor]/tabs-list:rounded-none group-data-[variant=editor]/tabs-list:border-0 group-data-[variant=editor]/tabs-list:bg-transparent group-data-[variant=editor]/tabs-list:px-2 group-data-[variant=editor]/tabs-list:py-0 group-data-[variant=editor]/tabs-list:text-[11px] group-data-[variant=editor]/tabs-list:font-medium group-data-[variant=editor]/tabs-list:data-[state=active]:border-transparent group-data-[variant=editor]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=editor]/tabs-list:data-[state=active]:text-inherit group-data-[variant=editor]/tabs-list:hover:bg-transparent group-data-[variant=editor]/tabs-list:after:hidden",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:border-primary/40",
        "after:bg-primary after:absolute after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:-bottom-1.25 group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
