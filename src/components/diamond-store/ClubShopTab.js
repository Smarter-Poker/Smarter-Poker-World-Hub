import React, { useState } from 'react';
import { Gem, Crown, ShoppingBag, Trophy, Gamepad2, Coins, Home, Package, Wrench, Search, Gift, AlertTriangle, CheckCircle, Trash2, Filter, Play, Sparkles, Users, Shield, Plus, X, ShoppingCart as CartIcon } from 'lucide-react';
import styles from './diamondStoreStyles';
import { getAccessToken } from '../../lib/authUtils';
import { showStoreToast } from '../store/StoreToast';
export default function ClubShopTab({
    clubShopClubId, clubShopLoaded, clubShopLoading, clubShopItems, clubShopPurchases, clubChipBalance,
    clubShopRole, clubShopSuccess, clubShopBuyTarget, setClubShopBuyTarget, clubShopProcessing, handleClubPurchase,
    clubShopSubTab, setClubShopSubTab, clubShopIsAdmin, clubShopCategory, setClubShopCategory, clubShopSearch,
    setClubShopSearch, clubShopSortMode, setClubShopSortMode, clubShopAdminLoaded, loadClubShopAdmin,
    clubShopAdminItems, clubShopNewName, setClubShopNewName, clubShopNewPrice, setClubShopNewPrice,
    clubShopNewDesc, setClubShopNewDesc, clubShopNewCategory, setClubShopNewCategory, clubShopNewImage,
    setClubShopNewImage, handleCreateClubItem, handleDeleteClubItem, handleToggleClubItem, loadClubShop
}) {
    return (
        <>

                            <>
                                {/* Success Flash */}
                                {clubShopSuccess && (
                                    <div style={{
                                        position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
                                        background: 'linear-gradient(135deg, #00ff88, #00cc66)', color: '#000',
                                        padding: '12px 28px', borderRadius: 12, fontWeight: 700, fontSize: 15,
                                        zIndex: 9999, boxShadow: '0 4px 20px rgba(0,255,136,0.4)', animation: 'fadeIn 0.3s ease',
                                    }}>
                                        <CheckCircle size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {clubShopSuccess}
                                    </div>
                                )}

                                {/* Purchase Confirm Modal */}
                                {clubShopBuyTarget && (
                                    <div
                                        onClick={() => !clubShopProcessing && setClubShopBuyTarget(null)}
                                        style={{
                                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                                            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
                                        }}
                                    >
                                        <div onClick={e => e.stopPropagation()} style={{
                                            background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)',
                                            borderRadius: 16, padding: 28, maxWidth: 420, width: '90%',
                                            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                                        }}>
                                            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Confirm Purchase</h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                                <div style={{
                                                    width: 56, height: 56, borderRadius: 12,
                                                    background: 'rgba(255,255,255,0.05)', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center', fontSize: 28,
                                                }}>
                                                    {clubShopBuyTarget.image_url
                                                        ? <img src={clubShopBuyTarget.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                                                        : <CartIcon size={28} color="#8b8d91" />}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#E4E6EB' }}>{clubShopBuyTarget.name}</div>
                                                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{clubShopBuyTarget.description || ''}</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                                                <div style={{
                                                    flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10,
                                                    padding: '12px 16px', textAlign: 'center',
                                                }}>
                                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Item Price</div>
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: '#ff6b6b', marginTop: 4 }}>{clubShopBuyTarget.price.toLocaleString()}</div>
                                                </div>
                                                <div style={{
                                                    flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10,
                                                    padding: '12px 16px', textAlign: 'center',
                                                }}>
                                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Your Balance</div>
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: '#00ff88', marginTop: 4 }}>{clubChipBalance.toLocaleString()}</div>
                                                </div>
                                            </div>
                                            {clubChipBalance < clubShopBuyTarget.price && (
                                                <div style={{ color: '#ff6b6b', fontSize: 13, fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>
                                                    <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Insufficient chips. You need {(clubShopBuyTarget.price - clubChipBalance).toLocaleString()} more.
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 12 }}>
                                                <button onClick={() => setClubShopBuyTarget(null)} disabled={clubShopProcessing}
                                                    style={{
                                                        flex: 1, padding: '12px', background: 'rgba(255,255,255,0.08)',
                                                        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
                                                        color: '#B0B3B8', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                                    }}>Cancel</button>
                                                <button onClick={handleClubPurchase}
                                                    disabled={clubShopProcessing || clubChipBalance < clubShopBuyTarget.price}
                                                    style={{
                                                        flex: 1, padding: '12px',
                                                        background: clubShopProcessing || clubChipBalance < clubShopBuyTarget.price
                                                            ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #1877F2, #4285F4)',
                                                        border: 'none', borderRadius: 10, color: '#fff',
                                                        fontSize: 14, fontWeight: 700, cursor: clubShopProcessing ? 'wait' : 'pointer',
                                                    }}>
                                                    {clubShopProcessing ? 'Purchasing...' : 'Confirm Purchase'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div style={styles.intro}>
                                    <h2 style={{ ...styles.merchTitle, display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <Gamepad2 size={20} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> Club Shop
                                        <span style={{
                                            fontSize: 14, fontWeight: 600,
                                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                            color: '#000', padding: '4px 14px', borderRadius: 20,
                                        }}>
                                            <Coins size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {clubChipBalance.toLocaleString()} Chips
                                        </span>
                                    </h2>
                                    <p style={styles.introText}>
                                        Purchase In-Game Items For Your Club With Chips — Time Banks, Table Skins, Throwables, Emotes & More.
                                    </p>
                                </div>

                                {clubShopLoading && !clubShopLoaded ? (
                                    <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
                                        Loading club shop...
                                    </div>
                                ) : !clubShopClubId ? (
                                    <div style={{ textAlign: 'center', padding: 40 }}>
                                        <div style={{ marginBottom: 12 }}><Home size={48} color="rgba(255,255,255,0.3)" /></div>
                                        <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>No Club Found</div>
                                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>Join a club to access the Club Shop.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Sub-tabs: Store / My Purchases / Manage (admin) */}
                                        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                                            {[{ key: 'store', label: `Store (${clubShopItems.length})`, LIcon: ShoppingBag },
                                              { key: 'my-purchases', label: `My Purchases (${clubShopPurchases.length})`, LIcon: Package },
                                              ...(clubShopIsAdmin ? [{ key: 'manage', label: 'Manage', LIcon: Wrench }] : []),
                                            ].map(st => (
                                                <button key={st.key} onClick={() => { setClubShopSubTab(st.key); if (st.key === 'manage' && !clubShopAdminLoaded) loadClubShopAdmin(); }}
                                                    style={{
                                                        padding: '8px 20px',
                                                        background: clubShopSubTab === st.key ? 'rgba(0,180,255,0.15)' : 'rgba(255,255,255,0.05)',
                                                        border: clubShopSubTab === st.key ? '1px solid rgba(0,180,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: 10, color: clubShopSubTab === st.key ? '#00D4FF' : 'rgba(255,255,255,0.5)',
                                                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                                    }}>
                                                    {st.LIcon && <st.LIcon size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />}
                                                    {st.label}
                                                </button>
                                            ))}
                                        </div>

                                        {clubShopSubTab === 'store' && (
                                            <>
                                                {/* Category Filters */}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                                    {['All', 'Time Banks', 'Table Skins', 'Throwables', 'Emotes', 'Avatars', 'Exclusive'].map(cat => (
                                                        <button key={cat} onClick={() => setClubShopCategory(cat)}
                                                            style={{
                                                                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                                background: clubShopCategory === cat ? 'rgba(0,180,255,0.2)' : 'rgba(255,255,255,0.05)',
                                                                border: clubShopCategory === cat ? '1px solid #00B4FF' : '1px solid rgba(255,255,255,0.1)',
                                                                color: clubShopCategory === cat ? '#00D4FF' : 'rgba(255,255,255,0.5)',
                                                                transition: 'all 0.2s ease',
                                                            }}>
                                                            {cat}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Search + Sort */}
                                                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                                                    <input
                                                        type="text" placeholder="Search items..."
                                                        value={clubShopSearch}
                                                        onChange={e => setClubShopSearch(e.target.value)}
                                                        style={{
                                                            flex: 1, padding: '10px 16px', borderRadius: 10,
                                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                                            color: '#E4E6EB', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                                        }}
                                                    />
                                                    <select
                                                        value={clubShopSortMode}
                                                        onChange={e => setClubShopSortMode(e.target.value)}
                                                        style={{
                                                            padding: '10px 14px', borderRadius: 10,
                                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                                            color: '#E4E6EB', fontSize: 13, outline: 'none', cursor: 'pointer',
                                                        }}>
                                                        <option value="newest">Newest First</option>
                                                        <option value="price-low">Price: Low → High</option>
                                                        <option value="price-high">Price: High → Low</option>
                                                        <option value="popular">Most Popular</option>
                                                    </select>
                                                </div>

                                                {/* Item Grid */}
                                                {(() => {
                                                    const purchasedIds = new Set(clubShopPurchases.map(p => p.item_id));
                                                    let filtered = [...clubShopItems];
                                                    if (clubShopCategory !== 'All') {
                                                        filtered = filtered.filter(i => (i.category || 'Time Banks').toLowerCase() === clubShopCategory.toLowerCase());
                                                    }
                                                    if (clubShopSearch.trim()) {
                                                        const q = clubShopSearch.toLowerCase();
                                                        filtered = filtered.filter(i => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q));
                                                    }
                                                    // Sort
                                                    switch (clubShopSortMode) {
                                                        case 'price-low': filtered.sort((a, b) => a.price - b.price); break;
                                                        case 'price-high': filtered.sort((a, b) => b.price - a.price); break;
                                                        case 'popular': filtered.sort((a, b) => (b.purchase_count || 0) - (a.purchase_count || 0)); break;
                                                        default: break; // newest = API order
                                                    }

                                                    if (filtered.length === 0) {
                                                        return (
                                                            <div style={{ textAlign: 'center', padding: 40 }}>
                                                                <div style={{ marginBottom: 12 }}><ShoppingBag size={48} color="rgba(255,255,255,0.3)" /></div>
                                                                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                                                                    {clubShopItems.length === 0 ? 'The shop is currently empty.' : 'No items match your filter.'}
                                                                </div>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                                            gap: 16,
                                                        }}>
                                                            {filtered.map(item => {
                                                                const owned = purchasedIds.has(item.id);
                                                                return (
                                                                    <div key={item.id} style={{
                                                                        background: 'rgba(255,255,255,0.05)',
                                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                                        borderRadius: 14, overflow: 'hidden',
                                                                        transition: 'border-color 0.2s, transform 0.2s',
                                                                    }}
                                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,180,255,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                                                                    >
                                                                        <div style={{
                                                                            height: 120, background: 'linear-gradient(135deg, rgba(0,180,255,0.08), rgba(138,43,226,0.08))',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            position: 'relative',
                                                                        }}>
                                                                            {item.image_url
                                                                                ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                                : <Gift size={40} color="#8b8d91" />}
                                                                            <span style={{
                                                                                position: 'absolute', top: 8, right: 8,
                                                                                background: 'rgba(0,0,0,0.7)', color: '#E4E6EB',
                                                                                padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                                                textTransform: 'uppercase',
                                                                            }}>{item.category || 'Time Banks'}</span>
                                                                        </div>
                                                                        <div style={{ padding: 14 }}>
                                                                            <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB', marginBottom: 4 }}>{item.name}</div>
                                                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, lineHeight: 1.4, minHeight: 30 }}>
                                                                                {item.description || 'No description.'}
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                <div>
                                                                                    <span style={{ fontSize: 16, fontWeight: 700, color: '#FFD700', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Coins size={14} /> {item.price.toLocaleString()}</span>
                                                                                    {(item.purchase_count || 0) > 0 && (
                                                                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{item.purchase_count} sold</div>
                                                                                    )}
                                                                                </div>
                                                                                <button
                                                                                    onClick={() => !owned && setClubShopBuyTarget(item)}
                                                                                    disabled={owned}
                                                                                    style={{
                                                                                        padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: owned ? 'default' : 'pointer',
                                                                                        background: owned ? 'rgba(0,255,136,0.15)' : 'linear-gradient(135deg, #1877F2, #4285F4)',
                                                                                        border: owned ? '1px solid rgba(0,255,136,0.3)' : 'none',
                                                                                        color: owned ? '#00ff88' : '#fff',
                                                                                    }}>
                                                                                    {owned ? <><CheckCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> Owned</> : 'Buy'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
                                            </>
                                        )}

                                        {/* My Purchases Sub-Tab */}
                                        {clubShopSubTab === 'my-purchases' && (
                                            <>
                                                {clubShopPurchases.length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: 40 }}>
                                                        <div style={{ marginBottom: 12 }}><Package size={48} color="rgba(255,255,255,0.3)" /></div>
                                                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>No purchases yet.</div>
                                                        <button onClick={() => setClubShopSubTab('store')}
                                                            style={{
                                                                marginTop: 12, padding: '10px 24px', borderRadius: 10,
                                                                background: 'linear-gradient(135deg, #1877F2, #4285F4)',
                                                                border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                                            }}>Browse Store</button>
                                                    </div>
                                                ) : (
                                                    <div style={{ overflowX: 'auto' }}>
                                                        <table style={{
                                                            width: '100%', borderCollapse: 'collapse',
                                                            background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                                                        }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Item</th>
                                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Category</th>
                                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Price Paid</th>
                                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Date</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {clubShopPurchases.map(p => {
                                                                    const itemData = clubShopItems.find(i => i.id === p.item_id);
                                                                    const name = p.item_name || itemData?.name || 'Unknown Item';
                                                                    const cat = p.item_category || itemData?.category || 'Time Banks';
                                                                    const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : '';
                                                                    return (
                                                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                                            <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: '#E4E6EB' }}>{name}</td>
                                                                            <td style={{ padding: '12px 16px' }}>
                                                                                <span style={{
                                                                                    padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                                                    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)',
                                                                                }}>{cat}</span>
                                                                            </td>
                                                                            <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, color: '#FFD700' }}>{(p.price_paid || 0).toLocaleString()}</td>
                                                                            <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{dateStr}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Manage Sub-Tab (admin only) */}
                                        {clubShopSubTab === 'manage' && clubShopIsAdmin && (
                                            <>
                                                {/* Admin Stats */}
                                                {(() => {
                                                    const total = clubShopAdminItems.length;
                                                    const active = clubShopAdminItems.filter(i => i.is_active).length;
                                                    const totalSold = clubShopAdminItems.reduce((s, i) => s + (i.purchase_count || 0), 0);
                                                    const totalRev = clubShopAdminItems.reduce((s, i) => s + (i.purchase_count || 0) * i.price, 0);
                                                    return (
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                                                            {[{ label: 'Total Items', val: total }, { label: 'Active', val: active },
                                                              { label: 'Total Sold', val: totalSold }, { label: 'Revenue', val: totalRev.toLocaleString() + ' chips' },
                                                            ].map(s => (
                                                                <div key={s.label} style={{
                                                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                                                                    borderRadius: 12, padding: '16px 14px', textAlign: 'center',
                                                                }}>
                                                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#00D4FF' }}>{s.val}</div>
                                                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginTop: 4 }}>{s.label}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}

                                                {/* Create Item Form */}
                                                <div style={{
                                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                                    borderRadius: 14, padding: 20, marginBottom: 24,
                                                }}>
                                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#E4E6EB', marginBottom: 14 }}>➕ Create Shop Item</h3>
                                                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                                                        <input value={clubShopNewName} onChange={e => setClubShopNewName(e.target.value)}
                                                            placeholder="Item name" maxLength={100}
                                                            style={{ flex: 2, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E4E6EB', fontSize: 14, outline: 'none' }} />
                                                        <input type="number" value={clubShopNewPrice} onChange={e => setClubShopNewPrice(e.target.value)}
                                                            placeholder="Price (chips)" min="1"
                                                            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E4E6EB', fontSize: 14, outline: 'none' }} />
                                                    </div>
                                                    <input value={clubShopNewDesc} onChange={e => setClubShopNewDesc(e.target.value)}
                                                        placeholder="Description (optional)" maxLength={500}
                                                        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E4E6EB', fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
                                                    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                                                        <select value={clubShopNewCategory} onChange={e => setClubShopNewCategory(e.target.value)}
                                                            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E4E6EB', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                                                            {['Time Banks', 'Table Skins', 'Throwables', 'Emotes', 'Avatars', 'Exclusive'].map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                        </select>
                                                        <input value={clubShopNewImage} onChange={e => setClubShopNewImage(e.target.value)}
                                                            placeholder="Image URL (optional)"
                                                            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E4E6EB', fontSize: 14, outline: 'none' }} />
                                                    </div>
                                                    <button
                                                        disabled={clubShopProcessing || !clubShopNewName.trim() || !clubShopNewPrice}
                                                        onClick={async () => {
                                                            const now = Date.now();
                                                            if (now - clubShopLastCreate < 3000) { showStoreToast('warning', 'Please wait before creating another item'); return; }
                                                            const price = Math.floor(Number(clubShopNewPrice));
                                                            if (!price || price <= 0) { showStoreToast('error', 'Price must be a positive number'); return; }
                                                            if (price > 1000000000) { showStoreToast('error', 'Price exceeds maximum'); return; }
                                                            setClubShopProcessing(true);
                                                            try {
                                                                // Server-side admin CRUD (post-Phase-37 RLS lockdown — anon
                                                                // writes to club_shop_items now blocked by design).
                                                                const token = getAccessToken();
                                                                if (!token) throw new Error('Not authenticated');
                                                                const resp = await fetch('/api/club-arena/shop-items', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                    body: JSON.stringify({
                                                                        action: 'create',
                                                                        clubId: clubShopClubId,
                                                                        name: clubShopNewName.trim(),
                                                                        price,
                                                                        description: clubShopNewDesc.trim() || null,
                                                                        category: clubShopNewCategory,
                                                                        imageUrl: clubShopNewImage.trim() || null
                                                                    })
                                                                });
                                                                const json = await resp.json().catch(() => ({}));
                                                                if (!resp.ok || !json.success) throw new Error(json.error || `HTTP ${resp.status}`);
                                                                setClubShopLastCreate(Date.now());
                                                                setClubShopNewName(''); setClubShopNewPrice(''); setClubShopNewDesc(''); setClubShopNewImage(''); setClubShopNewCategory('Time Banks');
                                                                loadClubShopAdmin();
                                                                clubShopLoadingRef.current = false;
                                                                loadClubShop(true);
                                                            } catch (err) { showStoreToast('error', err.message); } finally { setClubShopProcessing(false); }
                                                        }}
                                                        style={{
                                                            padding: '10px 28px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                                            background: 'linear-gradient(135deg, #1877F2, #4285F4)', border: 'none', color: '#fff',
                                                            opacity: (!clubShopNewName.trim() || !clubShopNewPrice) ? 0.5 : 1,
                                                        }}>
                                                        {clubShopProcessing ? 'Creating...' : 'Create Item'}
                                                    </button>
                                                </div>

                                                {/* Admin Item List */}
                                                {clubShopAdminItems.length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: 40 }}>
                                                        <div style={{ marginBottom: 12 }}><Wrench size={48} color="rgba(255,255,255,0.3)" /></div>
                                                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>No shop items yet. Create one above.</div>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        {clubShopAdminItems.map(item => (
                                                            <div key={item.id} style={{
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                                                                borderRadius: 10, padding: '12px 16px',
                                                            }}>
                                                                <div>
                                                                    <div style={{ fontWeight: 700, color: item.is_active ? '#E4E6EB' : '#6B7280', fontSize: 14 }}>{item.name}</div>
                                                                    <div style={{ fontSize: 12, color: '#8b8d91', marginTop: 2 }}>
                                                                        {item.price.toLocaleString()} chips • <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{item.category || 'Time Banks'}</span> • {item.purchase_count || 0} sold
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 8 }}>
                                                                    <button onClick={async () => {
                                                                        try {
                                                                            const token = getAccessToken();
                                                                            if (!token) throw new Error('Not authenticated');
                                                                            const resp = await fetch('/api/club-arena/shop-items', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                                body: JSON.stringify({ action: 'toggle', clubId: item.club_id, itemId: item.id })
                                                                            });
                                                                            const json = await resp.json().catch(() => ({}));
                                                                            if (!resp.ok || !json.success) throw new Error(json.error || `HTTP ${resp.status}`);
                                                                            loadClubShopAdmin();
                                                                            clubShopLoadingRef.current = false;
                                                                            loadClubShop(true);
                                                                        } catch (err) { showStoreToast('error', err.message); }
                                                                    }} style={{
                                                                        padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                                        background: item.is_active ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)',
                                                                        border: item.is_active ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(255,255,255,0.1)',
                                                                        color: item.is_active ? '#00ff88' : 'rgba(255,255,255,0.4)',
                                                                    }}>
                                                                        {item.is_active ? <><CheckCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> Active</> : 'Hidden'}
                                                                    </button>
                                                                    <button onClick={async () => {
                                                                        if (!confirm(`Delete "${item.name}"?`)) return;
                                                                        try {
                                                                            const token = getAccessToken();
                                                                            if (!token) throw new Error('Not authenticated');
                                                                            const resp = await fetch('/api/club-arena/shop-items', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                                body: JSON.stringify({ action: 'delete', clubId: item.club_id, itemId: item.id })
                                                                            });
                                                                            const json = await resp.json().catch(() => ({}));
                                                                            if (!resp.ok || !json.success) throw new Error(json.error || `HTTP ${resp.status}`);
                                                                            loadClubShopAdmin();
                                                                            clubShopLoadingRef.current = false;
                                                                            loadClubShop(true);
                                                                        } catch (err) { showStoreToast('error', err.message); }
                                                                    }} style={{
                                                                        padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                                        background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', color: '#ff6b6b',
                                                                    }}>
                                                                        <Trash2 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Delete
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </>
                        
        </>
    );
}