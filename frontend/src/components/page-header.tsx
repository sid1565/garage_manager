export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-7">
      <h1 className="font-display text-2xl font-bold text-[#0f1623]">{title}</h1>
      {description && <p className="mt-1 text-sm text-[#6b7e94]">{description}</p>}
    </header>
  );
}
