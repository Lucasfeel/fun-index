interface StatCardProps {
  label: string;
  value: string;
  meta?: string;
}

export function StatCard({ label, value, meta }: StatCardProps) {
  return (
    <article className="stat-card">
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      {meta ? <span className="stat-card__meta">{meta}</span> : null}
    </article>
  );
}
