export const SectionTitle: React.FC<{ title: string; subtitle?: string | string[] }> = ({ title, subtitle }) => (
    <div className="mb-3">
        <h2 className="text-white text-lg font-semibold leading-tight">{title}</h2>
        {subtitle && (
            <div className="text-text-secondary text-sm mt-1">
                {Array.isArray(subtitle) ? (
                    subtitle.map((line, index) => (
                        <div key={index}>{line}</div>
                    ))
                ) : (
                    <div>{subtitle}</div>
                )}
            </div>
        )}
    </div>
);

export default SectionTitle;