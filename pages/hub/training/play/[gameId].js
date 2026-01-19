/**
 * 🎮 TRAINING PLAY PAGE — SCORCHED EARTH REWRITE
 * ═══════════════════════════════════════════════════════════════════════════
 * HARD RULES:
 * - NO Supabase queries that block rendering
 * - Use UniversalTrainingTable for ALL games
 * - Map game IDs to clinic IDs
 * - Preserve game names/images from TRAINING_LIBRARY
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import UniversalTrainingTable from '../../../../src/components/training/UniversalTrainingTable';
import { getGameById } from '../../../../src/data/TRAINING_LIBRARY';
import { getClinicIdForGame } from '../../../../src/data/GAME_TO_CLINIC_MAP';

export default function TrainingPlayPage() {
    const router = useRouter();
    const { gameId } = router.query;

    // Wait for router to be ready
    if (!router.isReady || !gameId) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#0a1628',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00d4ff'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>Loading Game...</div>
                </div>
            </div>
        );
    }

    // Get game metadata (name, image) from TRAINING_LIBRARY
    const game = getGameById(gameId);
    const gameName = game?.name || 'Training';

    // Map game ID to clinic ID (e.g., mtt-002 → clinic-13)
    const clinicId = getClinicIdForGame(gameId) || 'clinic-01';

    console.log(`🎯 [ROUTING] gameId: ${gameId} → clinicId: ${clinicId}`);

    return (
        <>
            <Head>
                <title>{gameName} — PokerIQ Training</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            <UniversalTrainingTable
                gameId={clinicId}
                onAnswer={(action) => {
                    console.log('Player action:', action);
                }}
            />
        </>
    );
}
