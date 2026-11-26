import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

/** Shared heading so every tab has the same readable title + help text. */
export function PanelHeader({ title, description, actions }: Props) {
  return (
    <div className="panel-head">
      <div className="panel-heading">
        <h2>{title}</h2>
        {description && <p className="panel-note">{description}</p>}
      </div>
      {actions && <div className="panel-head-controls">{actions}</div>}
    </div>
  );
}
