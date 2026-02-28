type MatchNoteHintProps = {
  note?: string | null;
};

export function MatchNoteHint({ note }: MatchNoteHintProps) {
  const value = note?.trim();
  if (!value) {
    return <span className="match-note-empty">-</span>;
  }

  return (
    <span className="match-note-icon" title={value} aria-label={`Notatka: ${value}`} />
  );
}
