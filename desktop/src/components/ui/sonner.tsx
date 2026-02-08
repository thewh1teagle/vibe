import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			theme="system"
			className="toaster group"
			toastOptions={{
				classNames: {
					toast:
						'group toast rounded-xl border border-border/70 bg-card/98 text-card-foreground shadow-lg backdrop-blur-md dark:border-border/70 dark:bg-card/98 dark:text-card-foreground',
					title: 'text-sm font-semibold',
					description: 'text-sm text-muted-foreground',
					actionButton: 'bg-primary text-primary-foreground hover:bg-primary/90',
					cancelButton: 'bg-secondary text-secondary-foreground hover:bg-secondary/85',
					success: 'border-success/35 bg-success/12 text-foreground dark:border-success/40 dark:bg-success/18',
					error: 'border-destructive/35 bg-destructive/10 text-foreground dark:border-destructive/40 dark:bg-destructive/16',
					warning: 'border-chart-4/35 bg-chart-4/12 text-foreground dark:border-chart-4/40 dark:bg-chart-4/18',
					info: 'border-primary/35 bg-primary/10 text-foreground dark:border-primary/40 dark:bg-primary/16',
				},
			}}
			{...props}
		/>
	)
}

export { Toaster }
