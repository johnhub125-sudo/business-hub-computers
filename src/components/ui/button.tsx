import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-55 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "btn-primary text-white",
        accent: "btn-accent text-white",
        secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
        outline: "border border-line bg-white text-ink shadow-[0_1px_0_rgb(15_23_42/0.04)] hover:-translate-y-px hover:border-brand-300 hover:bg-brand-50/50 hover:shadow-md",
        ghost: "text-ink hover:bg-surface",
        danger: "bg-red-600 text-white hover:bg-red-700",
        success: "bg-emerald-600 text-white hover:bg-emerald-700",
        link: "text-brand-600 underline-offset-4 hover:underline px-0 h-auto",
        whatsapp: "bg-[#25D366] text-white hover:bg-[#1ebe5a]",
      },
      size: {
        sm: "h-9 px-3 text-[13px]",
        md: "h-11 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-lg",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Variants = VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  block,
  loading,
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & Variants & { loading?: boolean }) {
  return (
    <button className={cn(buttonVariants({ variant, size, block }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ className, variant, size, block, ...props }: ComponentProps<typeof Link> & Variants) {
  return <Link className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}
