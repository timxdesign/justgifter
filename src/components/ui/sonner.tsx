import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, InfoCircleIcon, DangerTriangleIcon, CloseCircleIcon } from "@/components/icons"
import { Spinner } from "@/components/ui/spinner"
import { useTheme } from "@/lib/theme"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: <CheckCircleIcon className="size-4" />,
        info: <InfoCircleIcon className="size-4" />,
        warning: <DangerTriangleIcon className="size-4" />,
        error: <CloseCircleIcon className="size-4" />,
        loading: <Spinner />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-xl)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "cn-toast" } }}
      {...props}
    />
  )
}

export { Toaster }
