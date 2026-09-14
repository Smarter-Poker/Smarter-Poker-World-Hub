import React from 'react';

export default function AccountingConversationIntroduction({ title, theme }) {
    return (
        <section aria-label="Accounting Conversation" style={{ color: theme.text, textAlign: 'center', marginBottom: 24, padding: '0 20px' }}>
            <div style={{ fontWeight: 600, fontSize: 17 }}>{title}</div>
            <p style={{ color: theme.textSec, fontSize: 13, marginTop: 8 }}>
                Invoices, Statements And Related Discussions
            </p>
        </section>
    );
}
