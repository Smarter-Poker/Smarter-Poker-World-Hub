/**
 * Diamond Arena - Table Settings
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function DiamondArenaTableSettings() {
    const router = useRouter();

    return (
        <>
            <SEOHead
                title="Diamond Arena Table Settings"
                description="Smarter.Poker — The Future Of The Game."
                noindex={true}
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '800px', margin: '0 auto' }}>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '12px' }}>
                            Table Settings
                        </h1>
                        <p style={{ color: '#9ca3af', marginBottom: '40px' }}>
                            Customize your table appearance and behavior
                        </p>

                        <div style={{ display: 'grid', gap: '20px' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>Sound Effects</div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>Play Sounds For Actions And Wins</div>
                                    </div>
                                    <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                                </label>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>Animations</div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>Enable Card Dealing And Chip Animations</div>
                                    </div>
                                    <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                                </label>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>Auto Rebuy</div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>Automatically Rebuy When Stack Is Low</div>
                                    </div>
                                    <input type="checkbox" style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                                </label>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '12px' }}>Table Theme</div>
                                <select style={{
                                    width: '100%',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#fff',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer'
                                }}>
                                    <option>Classic Green</option>
                                    <option>Midnight Blue</option>
                                    <option>Royal Red</option>
                                    <option>Diamond Black</option>
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={() => router.push('/hub/diamond-arena')}
                            style={{
                                background: '#3b82f6',
                                border: 'none',
                                color: '#fff',
                                padding: '16px 32px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '16px',
                                marginTop: '30px',
                                width: '100%'
                            }}
                        >
                            Save Settings
                        </button>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
