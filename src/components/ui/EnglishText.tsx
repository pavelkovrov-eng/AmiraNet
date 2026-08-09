interface EnglishTextProps {
  children: string;
  as?: 'span' | 'p' | 'div';
}

export function EnglishText({ children, as: Tag = 'span' }: EnglishTextProps) {
  return (
    <Tag dir="ltr" className="english-text">
      {children}
    </Tag>
  );
}
