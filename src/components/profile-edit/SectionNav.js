const SECTION_NAV_ITEMS = [
    { id: 'sec-basic', label: 'Basic' },
    { id: 'sec-location', label: 'Location' },
    { id: 'sec-social', label: 'Social' },
    { id: 'sec-cards', label: 'Cards' },
    { id: 'sec-poker', label: 'Poker' },
    { id: 'sec-resume', label: 'Resume' },
];

function SectionNav() {
    const scrollTo = (id) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    return (
        <div style={{
            position: 'sticky', top: 56, zIndex: 90,
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
            padding: '8px 16px', margin: '0 -16px 16px',
            display: 'flex', gap: 6, overflowX: 'auto',
            borderBottom: '1px solid #DADDE1',
        }}>
            {SECTION_NAV_ITEMS.map(s => (
                <button
                    key={s.id}
                    type="button"
                    onClick={() => scrollTo(s.id)}
                    style={{
                        padding: '6px 14px', borderRadius: 20,
                        background: '#E4E6EB', border: '1px solid #DADDE1',
                        color: '#65676B', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#1877F2'; e.currentTarget.style.color = '#ffffff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#E4E6EB'; e.currentTarget.style.color = '#65676B'; }}
                >{s.label}</button>
            ))}
        </div>
    );
}

export default SectionNav;
