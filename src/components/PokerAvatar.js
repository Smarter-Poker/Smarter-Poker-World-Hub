/**
 * 🎨 Avatar CSS Styling for Poker Tables
 * Applies clean circular clipping to avatars for use on poker tables
 */

export const avatarStyles = `
  .poker-avatar {
    /* Circular clipping */
    width: 80px;
    height: 80px;
    border-radius: 50%;
    object-fit: cover;
    object-position: center;
    
    /* Remove background (works with white/light backgrounds) */
    background: transparent;
    
    /* Clean border */
    border: 3px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    
    /* Smooth transitions */
    transition: all 0.3s ease;
  }
  
  .poker-avatar:hover {
    transform: scale(1.05);
    border-color: rgba(255, 215, 0, 0.6);
    box-shadow: 0 6px 16px rgba(255, 215, 0, 0.3);
  }
  
  .poker-avatar-large {
    width: 120px;
    height: 120px;
  }
  
  .poker-avatar-small {
    width: 50px;
    height: 50px;
    border-width: 2px;
  }
  
  /* Background removal using CSS blend mode (for white backgrounds) */
  .poker-avatar-clean {
    mix-blend-mode: multiply;
    background-color: transparent;
  }
`;

// React component for poker table avatars
export const PokerAvatar = ({ src, alt, size = 'medium', className = '' }) => {
    const sizeClass = {
        small: 'poker-avatar-small',
        medium: '',
        large: 'poker-avatar-large',
    }[size];

    return (
        <div className={`poker-avatar-container ${className}`}>
            <img
                src={src}
                alt={alt}
                className={`poker-avatar ${sizeClass}`}
                loading="lazy"
            />
        </div>
    );
};

export default PokerAvatar;
