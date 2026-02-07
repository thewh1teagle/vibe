import * as React from 'react'
import { cn } from '~/lib/utils'

const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
	<select
		ref={ref}
		className={cn(
			'flex h-10 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		{...props}
	/>
))

NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
