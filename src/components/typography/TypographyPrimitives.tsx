/**
 * Typography Primitives - Enforce PokerIQ Typography Law globally
 * 
 * These components apply formatPokerIQTitleCase by default
 * Use raw={true} to bypass (rare, auditable in dev)
 */

import React from 'react';
import { formatPokerIQTitleCase } from '../utils/formatPokerIQTitleCase';

interface TypographyProps {
    children?: React.ReactNode;
    raw?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * <Text> - Default text primitive
 * Applies Typography Law to string children
 */
export function Text({ children, raw, className, style }: TypographyProps) {
    // Dev warning for raw bypass
    if (process.env.NODE_ENV === 'development' && raw) {
        console.warn('[TYPO_LAW_RAW_BYPASS] Text component using raw={true}', {
            children,
            stack: new Error().stack
        });
    }

    const formatted = typeof children === 'string' && !raw
        ? formatPokerIQTitleCase(children)
        : children;

    return <span className={className} style={style}>{formatted}</span>;
}

/**
 * <Heading> - Heading primitive
 * Applies Typography Law to string children
 */
interface HeadingProps extends TypographyProps {
    level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export function Heading({ children, raw, level = 2, className, style }: HeadingProps) {
    // Dev warning for raw bypass
    if (process.env.NODE_ENV === 'development' && raw) {
        console.warn('[TYPO_LAW_RAW_BYPASS] Heading component using raw={true}', {
            children,
            stack: new Error().stack
        });
    }

    const formatted = typeof children === 'string' && !raw
        ? formatPokerIQTitleCase(children)
        : children;

    const Tag = `h${level}` as keyof JSX.IntrinsicElements;
    return <Tag className={className} style={style}>{formatted}</Tag>;
}

/**
 * <Label> - Label/caption primitive
 * Applies Typography Law to string children
 */
export function Label({ children, raw, className, style }: TypographyProps) {
    // Dev warning for raw bypass
    if (process.env.NODE_ENV === 'development' && raw) {
        console.warn('[TYPO_LAW_RAW_BYPASS] Label component using raw={true}', {
            children,
            stack: new Error().stack
        });
    }

    const formatted = typeof children === 'string' && !raw
        ? formatPokerIQTitleCase(children)
        : children;

    return <label className={className} style={style}>{formatted}</label>;
}

/**
 * Helper: Format string prop (for button labels, tooltips, etc.)
 */
export function formatProp(value: string | undefined, raw?: boolean): string | undefined {
    if (!value || raw) return value;
    return formatPokerIQTitleCase(value);
}
