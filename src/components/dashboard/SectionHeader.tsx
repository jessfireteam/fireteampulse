interface SectionHeaderProps {
  title: string;
  children?: React.ReactNode;
}

export function SectionHeader({ title, children }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="section-header">{title}</h2>
      {children}
    </div>
  );
}