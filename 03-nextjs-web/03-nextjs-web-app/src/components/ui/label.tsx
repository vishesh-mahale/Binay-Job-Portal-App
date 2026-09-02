import React from 'react';
import { cn } from '../../lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({ className, required, children, ...props }: LabelProps) {
  return (
    <label
      className={cn('block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5', className)}
      {...props}
    >
      {children}
      {required && <span className="ml-1 text-rose-500">*</span>}
    </label>
  );
}
