import React from 'react';

function GlyphShape({ kind }) {
  switch (kind) {
    case 'back': return <><path d="M19 12H6"/><path d="m11 7-5 5 5 5"/><path d="M19 8v8"/></>;
    case 'check': return <><path d="m5 12 4 4 10-10"/><path d="M4 4h16v16H4z"/></>;
    case 'clock': return <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l4 2"/><path d="M7 3h10"/></>;
    case 'mail': return <><path d="M3 6h18v13H3z"/><path d="m4 7 8 6 8-6"/><path d="M7 3h10"/></>;
    case 'radio': return <><circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/></>;
    case 'refresh': return <><path d="M19 8V4l-2 2a8 8 0 1 0 2 9"/><path d="M15 4h4v4"/></>;
    case 'search': return <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="M7 10.5h7"/></>;
    case 'send': return <><path d="m3 11 18-8-7 18-3-7-8-3Z"/><path d="m11 14 5-5"/></>;
    case 'shield': return <><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>;
    case 'users': return <><circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2"/><path d="M3.5 19c.5-4 2.5-6 5.5-6s5 2 5.5 6"/><path d="M15 15c2.8 0 4.5 1.3 5 4"/></>;
    case 'alert': return <><path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/></>;
    case 'archive': return <><path d="M4 7h16v13H4z"/><path d="M3 4h18v3H3z"/><path d="M9 12h6"/></>;
    case 'box': return <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/></>;
    case 'eye': return <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>;
    case 'glasses': return <><path d="M3 9h4l2 8H5L3 9ZM21 9h-4l-2 8h4l2-8Z"/><path d="M9 11h6"/><path d="M2 7h4M18 7h4"/></>;
    case 'layers': return <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m4 12 8 4 8-4"/><path d="m4 16 8 4 8-4"/></>;
    case 'package-plus': return <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 4-2"/><path d="M12 11v6"/><path d="M19 13v8M15 17h8"/></>;
    case 'save': return <><path d="M4 3h14l2 2v16H4z"/><path d="M8 3v6h8V3"/><path d="M8 21v-7h8v7"/></>;
    case 'shirt': return <><path d="m8 4-5 3 3 5 2-1v10h8V11l2 1 3-5-5-3c-.5 2-1.8 3-4 3S8.5 6 8 4Z"/></>;
    case 'spark': return <><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>;
    case 'tag': return <><path d="M3 4h8l10 10-7 7L4 11V4Z"/><circle cx="8" cy="8" r="1.5"/></>;
    case 'undo': return <><path d="m9 7-5 5 5 5"/><path d="M5 12h9a6 6 0 0 1 6 6v2"/></>;
    default: return <><path d="M4 4h16v16H4z"/><path d="M8 8h8v8H8z"/></>;
  }
}

export default function OperatorGlyph({ kind, size = 18, className = '', ...props }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeWidth="1.6"
      {...props}
    >
      <GlyphShape kind={kind} />
    </svg>
  );
}
