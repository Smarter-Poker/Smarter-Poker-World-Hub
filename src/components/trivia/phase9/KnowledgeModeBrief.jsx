import { PHASE9_KNOWLEDGE_CONTEXT } from './phase9RunModel.mjs';

export default function KnowledgeModeBrief({ mode }) {
    const brief = PHASE9_KNOWLEDGE_CONTEXT[mode];
    if (!brief) return null;

    return (
        <section className="phase9-mode-brief" aria-labelledby={`phase9-${mode}-brief-title`}>
            <h2 id={`phase9-${mode}-brief-title`}>{brief.eyebrow}</h2>
            <p>{brief.summary}</p>
            <dl className="phase9-mode-brief__rows">
                {brief.rows.map(([label, value]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
