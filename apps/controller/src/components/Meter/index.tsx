/**
 * The filled bar the role panels show under their action zone. The stylesheet
 * keys on the wrapper class and on a `span` child, so both stay as they are.
 */
export function Meter({
  className,
  label,
  value,
  capacity
}: {
  readonly className: string;
  readonly label: string;
  readonly value: number;
  readonly capacity: number;
}) {
  return (
    <div className={className} aria-label={label}>
      <span style={{ width: `${String((value / capacity) * 100)}%` }} />
    </div>
  );
}
