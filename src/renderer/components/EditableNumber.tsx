import React, { useState, useEffect } from 'react';

interface EditableNumberProps {
  value: number;
  onChange: (val: number) => void;
  toFixed?: number;
  suffix?: string;
  min?: number;
  max?: number;
}

export const EditableNumber: React.FC<EditableNumberProps> = ({ value, onChange, toFixed = 2, suffix = '', min, max }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value.toFixed(toFixed));

  useEffect(() => {
    if (!isEditing) setTempVal(value.toFixed(toFixed));
  }, [value, isEditing, toFixed]);

  const commit = () => {
    let parsed = parseFloat(tempVal);
    if (isNaN(parsed)) {
      setTempVal(value.toFixed(toFixed));
    } else {
      if (min !== undefined) parsed = Math.max(min, parsed);
      if (max !== undefined) parsed = Math.min(max, parsed);
      onChange(parsed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commit();
    } else if (e.key === 'Escape') {
      setTempVal(value.toFixed(toFixed));
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        type="number"
        step="any"
        value={tempVal}
        autoFocus
        onChange={e => setTempVal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        style={{ width: '50px', marginLeft: '4px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 4px', fontSize: '0.9em' }}
      />
    );
  }

  return (
    <span 
      onClick={() => setIsEditing(true)} 
      style={{ cursor: 'text', borderBottom: '1px dashed var(--muted)', padding: '0 2px', display: 'inline-block', minWidth: '20px', textAlign: 'center' }}
      title="Click to edit"
    >
      {value.toFixed(toFixed)}{suffix}
    </span>
  );
};
