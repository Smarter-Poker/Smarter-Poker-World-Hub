/**
 * TrustSeal — Shows provenance and source information
 * Per Masterplan Section VII: Truth Seal & Reproducibility
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function TrustSeal({ truthSeal, source, confidence }) {
  const [showDetails, setShowDetails] = useState(false);

  if (!truthSeal && !source) return null;

  const getSourceColor = () => {
    if (source?.includes('Solver-Verified')) return '#22c55e';
    if (source?.includes('Solver-Approx')) return '#f59e0b';
    return '#64b5f6'; // AI Approximation
  };

  const getConfidenceColor = () => {
    switch (confidence?.toLowerCase()) {
      case 'high': return '#22c55e';
      case 'medium': return '#f59e0b';
      case 'low': return '#ef4444';
      default: return '#64b5f6';
    }
  };

  return (
    <div style={styles.container}>
      <div
        style={styles.strip}
        onClick={() => setShowDetails(!showDetails)}
      >
        <span style={{ color: getSourceColor() }}>{source || 'Unknown Source'}</span>
        <span style={styles.divider}>|</span>
        <span>
          Confidence: <span style={{ color: getConfidenceColor() }}>{confidence || 'Unknown'}</span>
        </span>
        <span style={styles.infoIcon}>ⓘ</span>
      </div>

      <AnimatePresence>
        {showDetails && truthSeal && (
          <motion.div
            style={styles.details}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Source:</span>
              <span style={styles.detailValue}>{truthSeal.source}</span>
            </div>
            {truthSeal.template_id && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Template ID:</span>
                <span style={styles.detailValue}>{truthSeal.template_id}</span>
              </div>
            )}
            {truthSeal.stack_format_hash && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Format:</span>
                <span style={styles.detailValue}>{truthSeal.stack_format_hash}</span>
              </div>
            )}
            {truthSeal.model_version && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Model:</span>
                <span style={styles.detailValue}>{truthSeal.model_version}</span>
              </div>
            )}
            {truthSeal.timestamp && (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Generated:</span>
                <span style={styles.detailValue}>
                  {new Date(truthSeal.timestamp).toLocaleString()}
                </span>
              </div>
            )}
            <p style={styles.disclaimer}>
              Identical inputs will always produce identical outputs.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const styles = {
  container: {
    marginTop: 12,
  },
  strip: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    padding: '12px 0',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    cursor: 'pointer',
    alignItems: 'center',
  },
  divider: {
    color: 'rgba(255, 255, 255, 0.2)',
  },
  infoIcon: {
    marginLeft: 'auto',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 14,
  },
  details: {
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  detailLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  detailValue: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'monospace',
  },
  disclaimer: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 0,
  },
};
