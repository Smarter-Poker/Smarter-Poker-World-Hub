import re
import sys

def patch():
    with open('pages/auth/signup.js', 'r') as f:
        content = f.read()

    match_start = content.find("<div style={styles.container}>")
    match_end = content.find("                    {/* ═══════════════════════════════════════════════════════════════\n                        EMAIL PENDING")
    
    if match_start == -1 or match_end == -1:
        print("Could not find boundaries")
        return

    replacement = """
            {step === 'info' ? (
                <div style={{
                    position: 'relative', width: '100%', height: '100vh',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    backgroundColor: '#000', overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'relative', width: '100%', maxWidth: 'min(100vw, 71.4vh)',
                        aspectRatio: '10 / 14', backgroundImage: `url('/images/dynamic-signup-bg.jpg')`,
                        backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
                        boxShadow: '0 0 50px rgba(0, 212, 255, 0.2)'
                    }}>
                        <form onSubmit={handleSignUp} style={{width: '100%', height: '100%'}}>
                            
                            {/* Back Button */}
                            <button type="button" onClick={() => router.push('/')} title="Back" style={{
                                position: 'absolute', top: '3.5%', left: '3.5%', width: '8%', height: '3%',
                                background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 10
                            }} />

                            {/* Floating Error Toast */}
                            {error && (
                                <div style={{
                                    position: 'absolute', top: '15%', left: '10%', width: '80%', padding: '10px',
                                    background: 'rgba(240, 40, 73, 0.9)', color: 'white', textAlign: 'center',
                                    borderRadius: '8px', zIndex: 50, fontSize: '14px', fontWeight: 'bold'
                                }}>
                                    {error}
                                </div>
                            )}

                            {/* Social Buttons */}
                            <button type="button" onClick={() => handleOAuthSignIn('google')} disabled={!!oauthLoading} title="Continue With Google" style={{
                                position: 'absolute', top: '22.5%', left: '31%', width: '38%', height: '3.5%',
                                background: 'transparent', border: 'none', cursor: oauthLoading ? 'wait' : 'pointer', zIndex: 10
                            }} />
                            <button type="button" onClick={() => handleOAuthSignIn('facebook')} disabled={!!oauthLoading} title="Continue With Facebook" style={{
                                position: 'absolute', top: '26.5%', left: '31%', width: '38%', height: '3.5%',
                                background: 'transparent', border: 'none', cursor: oauthLoading ? 'wait' : 'pointer', zIndex: 10
                            }} />

                            {/* First Name & Last Name */}
                            <input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} required style={{
                                position: 'absolute', top: '35%', left: '31%', width: '18%', height: '3%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, padding: '0 8px'
                            }} />
                            <input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} required style={{
                                position: 'absolute', top: '35%', left: '51%', width: '18%', height: '3%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, padding: '0 8px'
                            }} />

                            {/* Email Address */}
                            <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required style={{
                                position: 'absolute', top: '40.5%', left: '31%', width: '38%', height: '3%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, padding: '0 8px'
                            }} />

                            {/* Password */}
                            <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required minLength={PW_MIN_LENGTH} style={{
                                position: 'absolute', top: '46.5%', left: '31%', width: '35%', height: '3%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, padding: '0 8px'
                            }} />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1} style={{
                                position: 'absolute', top: '46.5%', left: '66%', width: '3%', height: '3%',
                                background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 11
                            }} />

                            {/* Confirm Password */}
                            <input type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} required minLength={PW_MIN_LENGTH} style={{
                                position: 'absolute', top: '52%', left: '31%', width: '35%', height: '3%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, padding: '0 8px'
                            }} />
                            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} tabIndex={-1} style={{
                                position: 'absolute', top: '52%', left: '66%', width: '3%', height: '3%',
                                background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 11
                            }} />

                            {/* DOB (Month, Day, Year) */}
                            <select value={formData.birthMonth || ''} onChange={(e) => setFormData({ ...formData, birthMonth: e.target.value })} required style={{
                                position: 'absolute', top: '56.5%', left: '31%', width: '12%', height: '2.5%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, appearance: 'none', padding: '0 8px'
                            }}>
                                <option value="" style={{color: '#000'}}>Month</option>
                                <option value="01" style={{color: '#000'}}>January</option>
                                <option value="02" style={{color: '#000'}}>February</option>
                                <option value="03" style={{color: '#000'}}>March</option>
                                <option value="04" style={{color: '#000'}}>April</option>
                                <option value="05" style={{color: '#000'}}>May</option>
                                <option value="06" style={{color: '#000'}}>June</option>
                                <option value="07" style={{color: '#000'}}>July</option>
                                <option value="08" style={{color: '#000'}}>August</option>
                                <option value="09" style={{color: '#000'}}>September</option>
                                <option value="10" style={{color: '#000'}}>October</option>
                                <option value="11" style={{color: '#000'}}>November</option>
                                <option value="12" style={{color: '#000'}}>December</option>
                            </select>
                            
                            <select value={formData.birthDay || ''} onChange={(e) => setFormData({ ...formData, birthDay: e.target.value })} required style={{
                                position: 'absolute', top: '56.5%', left: '45.5%', width: '11%', height: '2.5%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, appearance: 'none', padding: '0 8px'
                            }}>
                                <option value="" style={{color: '#000'}}>Day</option>
                                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                                    <option key={day} value={String(day).padStart(2, '0')} style={{color: '#000'}}>{day}</option>
                                ))}
                            </select>
                            
                            <select value={formData.birthYear || ''} onChange={(e) => setFormData({ ...formData, birthYear: e.target.value })} required style={{
                                position: 'absolute', top: '56.5%', left: '58%', width: '11%', height: '2.5%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, appearance: 'none', padding: '0 8px'
                            }}>
                                <option value="" style={{color: '#000'}}>Year</option>
                                {Array.from({ length: 82 }, (_, i) => new Date().getFullYear() - 18 - i).map(year => (
                                    <option key={year} value={year} style={{color: '#000'}}>{year}</option>
                                ))}
                            </select>

                            {/* City & State */}
                            <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} required style={{
                                position: 'absolute', top: '61.5%', left: '31%', width: '20%', height: '3%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, padding: '0 8px'
                            }} />
                            <select value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} required style={{
                                position: 'absolute', top: '61.5%', left: '52%', width: '17%', height: '3%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, appearance: 'none', padding: '0 8px'
                            }}>
                                <option value="" style={{color: '#000'}}>Select</option>
                                {['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
                                  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
                                  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
                                  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
                                  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'].map(st => (
                                    <option key={st} value={st} style={{color: '#000'}}>{st}</option>
                                ))}
                            </select>

                            {/* Poker Alias */}
                            <input type="text" value={formData.pokerAlias} onChange={(e) => setFormData({ ...formData, pokerAlias: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} required minLength={3} maxLength={20} style={{
                                position: 'absolute', top: '66%', left: '31%', width: '38%', height: '3%',
                                background: 'transparent', border: 'none', color: aliasAvailable === false ? '#F02849' : (aliasAvailable === true ? '#31A24C' : '#fff'), fontSize: '14px', outline: 'none', zIndex: 10, padding: '0 8px'
                            }} />
                            
                            {/* Phone Number (+1 is built into the image design maybe? But we need a full input) */}
                            {/* Actually there's a +1 box in the image. I will just overlay the input on the second box */}
                            <input type="tel" value={formatPhone(formData.phone)} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} required disabled={phoneVerified} maxLength={14} style={{
                                position: 'absolute', top: '71.5%', left: '37%', width: '20.5%', height: '3%',
                                background: 'transparent', border: 'none', color: phoneVerified ? '#31A24C' : '#fff', fontSize: '14px', outline: 'none', zIndex: 10, padding: '0 8px'
                            }} />
                            {!phoneVerified && (
                                <button type="button" onClick={sendPhoneOtp} disabled={phoneSendingOtp || phoneOtpCooldown > 0 || formData.phone.replace(/\D/g, '').length !== 10} title="Send Code" style={{
                                    position: 'absolute', top: '71.5%', left: '59.5%', width: '9.5%', height: '3%',
                                    background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 10
                                }}>
                                    {/* Text is painted on image. We just need the clickable area. */}
                                    <span style={{color: 'transparent'}}>Send</span>
                                </button>
                            )}

                            {/* Promo Code */}
                            <input type="text" value={formData.promoCode} onChange={(e) => setFormData({ ...formData, promoCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} maxLength={20} style={{
                                position: 'absolute', top: '77%', left: '31%', width: '38%', height: '3%',
                                background: 'transparent', border: 'none', color: '#fff', fontSize: '14px', outline: 'none', zIndex: 10, padding: '0 8px', textTransform: 'uppercase'
                            }} />

                            {/* Checkbox 18+ */}
                            <input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} required style={{
                                position: 'absolute', top: '80.5%', left: '31%', width: '2%', height: '2%',
                                opacity: 0.01, cursor: 'pointer', zIndex: 10
                            }} />
                            {/* Render a checkmark if ageConfirmed is true, since the native checkbox is hidden */}
                            {ageConfirmed && (
                                <svg style={{ position: 'absolute', top: '80.5%', left: '31%', width: '2%', height: '2%', pointerEvents: 'none', zIndex: 11 }} viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            )}

                            {/* Create Account Button */}
                            <button type="submit" disabled={loading || aliasAvailable === false || !ageConfirmed || !phoneVerified} title="Create Account" style={{
                                position: 'absolute', top: '84%', left: '31%', width: '38%', height: '3.5%',
                                background: 'transparent', border: 'none', cursor: (loading || aliasAvailable === false || !ageConfirmed || !phoneVerified) ? 'not-allowed' : 'pointer', zIndex: 10
                            }} />

                            {/* Terms & Privacy */}
                            <a href="/terms" target="_blank" style={{
                                position: 'absolute', top: '89.5%', left: '47%', width: '5%', height: '1%',
                                background: 'transparent', zIndex: 10, cursor: 'pointer'
                            }} />
                            <a href="/terms" target="_blank" style={{
                                position: 'absolute', top: '89.5%', left: '58%', width: '4%', height: '1%',
                                background: 'transparent', zIndex: 10, cursor: 'pointer'
                            }} />

                            {/* Sign In Link */}
                            <button type="button" onClick={() => router.push('/auth/login')} title="Sign In" style={{
                                position: 'absolute', top: '94.5%', left: '56%', width: '5%', height: '1.5%',
                                background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 10
                            }} />

                        </form>
                    </div>
                </div>
            ) : (
                <div style={styles.container}>
"""
    
    new_content = content[:match_start] + replacement + content[match_end:]
    
    with open('pages/auth/signup.js', 'w') as f:
        f.write(new_content)
    print("Patch applied successfully")

if __name__ == '__main__':
    patch()
