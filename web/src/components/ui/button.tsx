import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "destructive";
type Size = "sm" | "md" | "icon";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border border-border bg-card text-foreground hover:bg-accent",
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
  destructive:
    "border border-destructive/50 bg-card text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/15",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5",
  md: "h-10 gap-2 px-4 text-sm [&_svg]:size-4",
  icon: "size-9 [&_svg]:size-4",
};

/** The site's buttons: the same shapes as the home page's links, for actions. */
export function buttonClass(variant: Variant = "outline", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export function Button({
  variant = "outline",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}
