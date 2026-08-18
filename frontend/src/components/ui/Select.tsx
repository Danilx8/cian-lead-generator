interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    containerClassName?: string;
}

export const Select: React.FC<SelectProps> = ({ className = '', containerClassName = '', children, ...props }) => (
    <div className={`relative ${containerClassName}`}>
        <select {...props} className={`appearance-none pr-8 ${className}`}>
            {children}
        </select>
        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-70" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    </div>
);

export default Select;